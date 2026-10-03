import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { shopifyService } from '../services/shopify.js';
import { checkOrderReturnEligibility, calculateMaxRefund } from '../services/eligibility.js';
import { emailService } from '../services/email.js';
import { orderLookupLimiter } from '../middleware/rateLimit.js';

import { config } from '../config.js';

const router = Router();

// Validation Schemas
const OrderLookupSchema = z.object({
  orderNumber: z.string().min(1, 'Order number is required'),
  emailOrPhone: z.string().min(3, 'Email or phone number is required')
});

const ReturnSubmitItemSchema = z.object({
  orderItemId: z.string(),
  quantity: z.number().int().positive('Quantity must be at least 1'),
  reason: z.string(),
  comments: z.string().optional(),
  // For replacement
  replacementVariantId: z.string().optional(),
  replacementVariantTitle: z.string().optional()
});

const PickupAddressSchema = z.object({
  name: z.string().min(2, 'Full name is required'),
  address1: z.string().min(3, 'Address line 1 is required'),
  address2: z.string().optional(),
  city: z.string().min(2, 'City is required'),
  state: z.string().min(2, 'State is required'),
  pincode: z.string().regex(/^[1-9][0-9]{5}$/, 'Please enter a valid 6-digit Indian PIN code'),
  phone: z.string().regex(/^(?:\+91|91)?[6-9]\d{9}$/, 'Please enter a valid 10-digit Indian mobile number'),
  email: z.string().email().optional(),
});

const ReturnSubmitSchema = z.object({
  orderId: z.string(),
  requestType: z.enum(['RETURN_REFUND', 'REPLACEMENT']),
  reason: z.enum(['DAMAGED', 'WRONG_PRODUCT', 'SIZE_FIT', 'MISSING_ITEM', 'QUALITY', 'OTHER']),
  customerNotes: z.string().max(1000).optional(),
  refundMethod: z.enum(['ORIGINAL_PAYMENT', 'STORE_CREDIT', 'MANUAL_BANK_UPI']).optional(),
  pickupAddress: PickupAddressSchema.optional(),
  items: z.array(ReturnSubmitItemSchema).min(1, 'At least one item must be selected'),
  uploadedFiles: z.array(z.object({
    filename: z.string(),
    originalName: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number(),
    filePath: z.string()
  })).optional()
});

/**
 * 1. Customer Order Lookup
 * Validates order number + contact match and evaluates return eligibility
 * Does not leak whether order exists until contact is verified
 */
router.post('/orders/lookup', orderLookupLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = OrderLookupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'VALIDATION_FAILED', message: parsed.error.issues[0].message });
    }

    const { orderNumber, emailOrPhone } = parsed.data;

    // 1. Fetch from Shopify
    const shopifyOrder = await shopifyService.findOrderByNumber(orderNumber, emailOrPhone);

    if (!shopifyOrder) {
      return res.status(404).json({
        error: 'ORDER_NOT_FOUND',
        message: 'No matching order found with the provided details. Please verify your order number and contact information.'
      });
    }

    // 2. Fetch or create store in local DB
    let store = await prisma.store.findFirst({
      where: { shopDomain: config.SHOPIFY_SHOP },
      include: { settings: true }
    });

    if (!store) {
      store = await prisma.store.create({
        data: {
          shopDomain: config.SHOPIFY_SHOP,
          shopName: 'ETHNOIR',
          settings: {
            create: {
              returnWindowDays: 7,
              autoApproveReturns: false,
              requirePhotoUpload: true,
              defaultRefundMethod: 'ORIGINAL_PAYMENT'
            }
          }
        },
        include: { settings: true }
      });
    }

    const returnWindowDays = store.settings?.returnWindowDays ?? 7;

    // 3. Upsert order in database
    const orderNumberSaved = shopifyOrder.name.replace('#', '').trim();
    let dbOrder = await prisma.order.findFirst({
      where: {
        OR: [
          { shopifyId: shopifyOrder.id },
          { orderNumber: orderNumberSaved },
          { orderNumber: shopifyOrder.name.replace(/[^0-9]/g, '') }
        ]
      },
      include: {
        items: true,
        returnRequests: {
          include: { returnItems: true }
        }
      }
    });

    const deliveryDate = shopifyOrder.fulfillments?.[0]?.deliveredAt
      ? new Date(shopifyOrder.fulfillments[0].deliveredAt)
      : (shopifyOrder.fulfillments?.[0]?.createdAt ? new Date(shopifyOrder.fulfillments[0].createdAt) : null);

    if (!dbOrder) {
      // Find or create customer
      let customer = await prisma.customer.findFirst({
        where: {
          OR: [
            { email: shopifyOrder.customer?.email || undefined },
            { phone: shopifyOrder.customer?.phone || shopifyOrder.shippingAddress?.phone || undefined }
          ]
        }
      });

      if (!customer && (shopifyOrder.customer?.email || shopifyOrder.customer?.phone || shopifyOrder.shippingAddress?.phone)) {
        customer = await prisma.customer.create({
          data: {
            shopifyId: shopifyOrder.customer?.id,
            email: shopifyOrder.customer?.email,
            phone: shopifyOrder.customer?.phone || shopifyOrder.shippingAddress?.phone,
            firstName: shopifyOrder.customer?.firstName,
            lastName: shopifyOrder.customer?.lastName
          }
        });
      }

      dbOrder = await prisma.order.create({
        data: {
          shopifyId: shopifyOrder.id,
          orderNumber: orderNumberSaved,
          storeId: store.id,
          customerId: customer?.id,
          customerEmail: shopifyOrder.customer?.email,
          customerPhone: shopifyOrder.customer?.phone || shopifyOrder.shippingAddress?.phone,
          fulfillmentStatus: shopifyOrder.displayFulfillmentStatus,
          deliveryDate,
          totalPrice: parseFloat(shopifyOrder.totalPriceSet?.shopMoney?.amount || '0'),
          currency: shopifyOrder.currencyCode || 'INR',
          shippingAddressJson: JSON.stringify(shopifyOrder.shippingAddress || {}),
          createdAt: new Date(shopifyOrder.createdAt),
          items: {
            create: shopifyOrder.lineItems.nodes.map(li => {
              const tags = li.product?.tags || [];
              const isNonReturnable = tags.some(t => t.toLowerCase().includes('non-returnable') || t.toLowerCase().includes('final-sale'));
              return {
                shopifyLineItemId: li.id,
                shopifyProductId: li.product?.id,
                title: li.title,
                variantTitle: li.variantTitle,
                sku: li.sku,
                quantity: li.quantity,
                price: parseFloat(li.originalUnitPriceSet?.shopMoney?.amount || '0'),
                imageUrl: li.image?.url,
                isReturnable: !isNonReturnable
              };
            })
          }
        },
        include: {
          items: true,
          returnRequests: {
            include: { returnItems: true }
          }
        }
      });
    }

    // 4. Calculate already returned quantities
    const alreadyReturnedMap: Record<string, number> = {};
    for (const req of dbOrder.returnRequests) {
      if (req.status !== 'REJECTED') {
        for (const item of req.returnItems) {
          alreadyReturnedMap[item.orderItemId] = (alreadyReturnedMap[item.orderItemId] || 0) + item.quantity;
        }
      }
    }

    // 5. Evaluate eligibility
    const eligibilityInput = {
      orderNumber: dbOrder.orderNumber,
      fulfillmentStatus: dbOrder.fulfillmentStatus,
      deliveryDate: dbOrder.deliveryDate,
      createdAt: dbOrder.createdAt,
      returnWindowDays,
      items: dbOrder.items.map(item => ({
        orderItemId: item.id,
        quantityRequested: 1,
        price: item.price,
        isReturnable: item.isReturnable,
        purchasedQuantity: item.quantity,
        alreadyReturnedQuantity: alreadyReturnedMap[item.id] || 0
      }))
    };

    const eligibility = checkOrderReturnEligibility(eligibilityInput);

    // Attach variant options from Shopify for replacements
    const itemsWithVariants = dbOrder.items.map(item => {
      const shopifyLineItem = shopifyOrder.lineItems.nodes.find(l => l.title === item.title || l.sku === item.sku);
      const availableVariants = shopifyLineItem?.product?.variants?.nodes || [];
      const itemEligible = eligibility.itemResults.find(r => r.orderItemId === item.id);

      return {
        ...item,
        alreadyReturned: alreadyReturnedMap[item.id] || 0,
        availableUnits: itemEligible?.availableQuantity ?? 0,
        isEligible: itemEligible?.isEligible ?? false,
        ineligibilityReason: itemEligible?.reason,
        availableVariants: availableVariants.map(v => ({
          id: v.id,
          title: v.title,
          sku: v.sku,
          inStock: v.availableForSale && (v.inventoryQuantity ?? 1) > 0,
          inventoryQuantity: v.inventoryQuantity ?? 0
        }))
      };
    });

    return res.json({
      success: true,
      order: {
        id: dbOrder.id,
        orderNumber: dbOrder.orderNumber,
        formattedName: `#${dbOrder.orderNumber}`,
        createdAt: dbOrder.createdAt,
        fulfillmentStatus: dbOrder.fulfillmentStatus,
        deliveryDate: dbOrder.deliveryDate,
        totalPrice: dbOrder.totalPrice,
        currency: dbOrder.currency,
        customer: {
          name: shopifyOrder.customer ? `${shopifyOrder.customer.firstName || ''} ${shopifyOrder.customer.lastName || ''}`.trim() : 'Customer',
          email: dbOrder.customerEmail,
          phone: dbOrder.customerPhone,
        },
        shippingAddress: JSON.parse(dbOrder.shippingAddressJson || '{}'),
        items: itemsWithVariants,
        returnRequests: dbOrder.returnRequests.map(r => ({
          id: r.id,
          requestNumber: r.requestNumber,
          requestType: r.requestType,
          status: r.status,
          createdAt: r.createdAt
        }))
      },
      eligibility: {
        isEligible: eligibility.isEligible,
        reasons: eligibility.reasons,
        daysRemaining: eligibility.daysRemaining,
        returnWindowDays
      }
    });
  } catch (err: any) {
    console.error('[Customer Order Lookup Error]:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to look up order. Please try again.' });
  }
});

/**
 * 2. Submit Return / Replacement Request
 */
router.post('/returns/submit', async (req: Request, res: Response) => {
  try {
    const parsed = ReturnSubmitSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'VALIDATION_FAILED', message: parsed.error.issues[0].message });
    }

    const { orderId, requestType, reason, customerNotes, refundMethod, pickupAddress, items, uploadedFiles } = parsed.data;

    // Fetch order with items
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        store: { include: { settings: true } },
        returnRequests: { include: { returnItems: true } }
      }
    });

    if (!order) {
      return res.status(404).json({ error: 'ORDER_NOT_FOUND', message: 'Order not found.' });
    }

    // Check return window
    const returnWindowDays = order.store.settings?.returnWindowDays ?? 7;
    const refDate = order.deliveryDate ? new Date(order.deliveryDate) : new Date(order.createdAt);
    const diffDays = Math.floor((Date.now() - refDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > returnWindowDays) {
      return res.status(400).json({
        error: 'WINDOW_EXPIRED',
        message: `The ${returnWindowDays}-day return window has expired for this order.`
      });
    }

    // Validate quantities and prevent duplicates
    let totalRefundAmount = 0;
    const returnItemCreates: any[] = [];
    const replacementItemCreates: any[] = [];

    for (const itemInput of items) {
      const orderItem = order.items.find(i => i.id === itemInput.orderItemId);
      if (!orderItem) {
        return res.status(400).json({ error: 'INVALID_ITEM', message: `Item ${itemInput.orderItemId} does not belong to this order.` });
      }

      if (!orderItem.isReturnable) {
        return res.status(400).json({ error: 'NON_RETURNABLE', message: `'${orderItem.title}' is marked non-returnable.` });
      }

      // Calculate previously returned
      const previouslyReturned = order.returnRequests
        .filter(r => r.status !== 'REJECTED')
        .flatMap(r => r.returnItems)
        .filter(ri => ri.orderItemId === orderItem.id)
        .reduce((sum, ri) => sum + ri.quantity, 0);

      const availableToReturn = orderItem.quantity - previouslyReturned;
      if (itemInput.quantity > availableToReturn) {
        return res.status(400).json({
          error: 'QUANTITY_EXCEEDED',
          message: `Cannot request ${itemInput.quantity} units for '${orderItem.title}'. Only ${availableToReturn} unit(s) eligible.`
        });
      }

      const itemRefundAmount = orderItem.price * itemInput.quantity;
      totalRefundAmount += itemRefundAmount;

      returnItemCreates.push({
        orderItemId: orderItem.id,
        quantity: itemInput.quantity,
        reason: itemInput.reason || reason,
        comments: itemInput.comments,
        refundAmount: itemRefundAmount
      });

      if (requestType === 'REPLACEMENT') {
        if (!itemInput.replacementVariantId) {
          return res.status(400).json({ error: 'VARIANT_REQUIRED', message: `Please select a replacement variant for '${orderItem.title}'.` });
        }

        // Inventory check before replacement
        const stock = await shopifyService.checkVariantStock(itemInput.replacementVariantId);
        if (!stock.inStock) {
          return res.status(400).json({
            error: 'OUT_OF_STOCK',
            message: `The selected replacement variant for '${orderItem.title}' is currently out of stock.`
          });
        }

        replacementItemCreates.push({
          targetProductId: orderItem.shopifyProductId || 'unknown',
          targetVariantId: itemInput.replacementVariantId,
          title: orderItem.title,
          variantTitle: itemInput.replacementVariantTitle || 'Replacement Variant',
          quantity: itemInput.quantity,
          inStock: true,
          inventoryCheckedAt: new Date()
        });
      }
    }

    // Generate unique Request Number
    const count = await prisma.returnRequest.count();
    const currentYear = new Date().getFullYear();
    const requestNumber = `RET-${currentYear}-${(count + 1).toString().padStart(4, '0')}`;

    // Auto-approve rule check
    const autoApprove = order.store.settings?.autoApproveReturns ?? false;
    const initialStatus = autoApprove ? 'APPROVED' : 'SUBMITTED';

    // Resolved pickup address JSON
    const finalPickupAddressJson = pickupAddress
      ? JSON.stringify(pickupAddress)
      : (order.shippingAddressJson || null);

    // Create the Return Request transactionally
    const newRequest = await prisma.$transaction(async (tx) => {
      const created = await tx.returnRequest.create({
        data: {
          requestNumber,
          storeId: order.storeId,
          orderId: order.id,
          customerId: order.customerId,
          requestType,
          status: initialStatus,
          reason,
          customerNotes,
          refundMethod: requestType === 'RETURN_REFUND' ? (refundMethod || 'ORIGINAL_PAYMENT') : null,
          refundAmount: requestType === 'RETURN_REFUND' ? totalRefundAmount : 0,
          pickupAddressJson: finalPickupAddressJson,
          returnItems: {
            create: returnItemCreates
          },
          replacementItems: {
            create: replacementItemCreates
          },
          uploadedFiles: {
            create: (uploadedFiles || []).map(f => ({
              filename: f.filename,
              originalName: f.originalName,
              mimeType: f.mimeType,
              sizeBytes: f.sizeBytes,
              filePath: f.filePath
            }))
          },
          statusEvents: {
            create: [
              {
                status: initialStatus,
                actorType: 'CUSTOMER',
                actorName: order.customerEmail || 'Customer',
                message: `Request created for ${items.length} item(s) (${requestType === 'REPLACEMENT' ? 'Replacement' : 'Return & Refund'})`
              }
            ]
          }
        },
        include: {
          returnItems: { include: { orderItem: true } },
          replacementItems: true,
          uploadedFiles: true,
          statusEvents: true
        }
      });

      return created;
    });

    // Notify customer via email
    if (order.customerEmail) {
      await emailService.sendStatusUpdate({
        toEmail: order.customerEmail,
        customerName: order.customerEmail.split('@')[0],
        requestNumber: newRequest.requestNumber,
        orderNumber: order.orderNumber,
        status: newRequest.status,
        requestType: newRequest.requestType,
        details: {
          itemsCount: items.length,
          refundAmount: totalRefundAmount
        }
      });
    }

    return res.status(201).json({
      success: true,
      requestNumber: newRequest.requestNumber,
      requestId: newRequest.id,
      status: newRequest.status,
      message: `Your ${requestType === 'REPLACEMENT' ? 'replacement' : 'return'} request ${newRequest.requestNumber} has been successfully submitted!`
    });
  } catch (err: any) {
    console.error('[Submit Return Error]:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to submit request. Please try again.' });
  }
});

/**
 * 3. Track Return Request Status by Request Number + Customer Verification
 */
router.all('/returns/track/:requestNumber', async (req: Request, res: Response) => {
  try {
    const requestNumber = String(req.params.requestNumber || '');
    const contact = ((req.query.contact as string) || req.body?.contact || '').trim().toLowerCase();

    if (!contact) {
      return res.status(400).json({
        error: 'VERIFICATION_REQUIRED',
        message: 'Please provide the email address or phone number associated with this order to view tracking details.'
      });
    }

    const returnRequest = await prisma.returnRequest.findUnique({
      where: { requestNumber: requestNumber.toUpperCase() },
      include: {
        order: true,
        returnItems: { include: { orderItem: true } },
        replacementItems: true,
        uploadedFiles: true,
        shipments: true,
        refunds: true,
        statusEvents: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!returnRequest) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'No request found matching the provided reference number and contact verification.'
      });
    }

    // Customer Identity Verification
    const orderEmail = (returnRequest.order.customerEmail || '').toLowerCase();
    const orderPhoneClean = (returnRequest.order.customerPhone || '').replace(/[^0-9]/g, '');
    const contactClean = contact.replace(/[^0-9]/g, '');

    const emailMatch = orderEmail && orderEmail === contact;
    const phoneMatch = orderPhoneClean && contactClean && (orderPhoneClean.slice(-10) === contactClean.slice(-10));

    if (!emailMatch && !phoneMatch) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'No request found matching the provided reference number and contact verification.'
      });
    }

    const pickupAddress = returnRequest.pickupAddressJson
      ? JSON.parse(returnRequest.pickupAddressJson)
      : (returnRequest.order.shippingAddressJson ? JSON.parse(returnRequest.order.shippingAddressJson) : null);

    return res.json({
      success: true,
      request: {
        id: returnRequest.id,
        requestNumber: returnRequest.requestNumber,
        requestType: returnRequest.requestType,
        status: returnRequest.status,
        reason: returnRequest.reason,
        customerNotes: returnRequest.customerNotes,
        rejectionReason: returnRequest.rejectionReason,
        refundAmount: returnRequest.refundAmount,
        refundMethod: returnRequest.refundMethod,
        pickupAddress,
        createdAt: returnRequest.createdAt,
        updatedAt: returnRequest.updatedAt,
        order: {
          orderNumber: returnRequest.order.orderNumber,
          currency: returnRequest.order.currency,
          customerEmail: returnRequest.order.customerEmail
        },
        items: returnRequest.returnItems.map(item => ({
          id: item.id,
          title: item.orderItem.title,
          variantTitle: item.orderItem.variantTitle,
          quantity: item.quantity,
          price: item.orderItem.price,
          imageUrl: item.orderItem.imageUrl,
          refundAmount: item.refundAmount
        })),
        replacementItems: returnRequest.replacementItems.map(item => ({
          id: item.id,
          title: item.title,
          variantTitle: item.variantTitle,
          quantity: item.quantity,
          inStock: item.inStock
        })),
        shipments: returnRequest.shipments.map(s => ({
          id: s.id,
          type: s.type,
          courierName: s.courierName,
          awbNumber: s.awbNumber,
          trackingUrl: s.trackingUrl,
          status: s.status
        })),
        timeline: returnRequest.statusEvents.map(ev => ({
          status: ev.status,
          actorType: ev.actorType,
          message: ev.message,
          createdAt: ev.createdAt
        }))
      }
    });
  } catch (err: any) {
    console.error('[Track Return Error]:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to retrieve request details.' });
  }
});

export default router;
