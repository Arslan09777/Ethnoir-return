import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { requireAdminAuth } from '../middleware/auth.js';
import { shopifyService } from '../services/shopify.js';
import { shiprocketService } from '../services/shiprocket.js';
import { emailService } from '../services/email.js';

const router = Router();

// Validation Schemas
const AdminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

/**
 * 1. Admin Login
 */
router.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const parsed = AdminLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'VALIDATION_FAILED', message: parsed.error.issues[0].message });
    }

    const { email, password } = parsed.data;

    let admin = await prisma.adminUser.findUnique({ where: { email } });

    // Seed default admin if table is empty
    if (!admin) {
      const adminCount = await prisma.adminUser.count();
      if (adminCount === 0 && email.toLowerCase() === config.ADMIN_DEFAULT_EMAIL.toLowerCase()) {
        const hash = await bcrypt.hash(config.ADMIN_DEFAULT_PASSWORD, 10);
        admin = await prisma.adminUser.create({
          data: {
            email: config.ADMIN_DEFAULT_EMAIL,
            passwordHash: hash,
            name: 'Store Administrator',
            role: 'ADMIN'
          }
        });
      }
    }

    if (!admin || !admin.isActive) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, admin.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' });
    }

    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() }
    });

    const token = jwt.sign(
      { adminId: admin.id, email: admin.email, role: admin.role },
      config.SESSION_SECRET,
      { expiresIn: '7d' }
    );

    // Set secure HTTP-only cookie
    res.cookie('admin_token', token, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.json({
      success: true,
      token,
      user: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role
      }
    });
  } catch (err: any) {
    console.error('[Admin Login Error]:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Login failed. Please try again.' });
  }
});

/**
 * 2. Admin Logout
 */
router.post('/auth/logout', (_req: Request, res: Response) => {
  res.clearCookie('admin_token');
  return res.json({ success: true, message: 'Logged out successfully.' });
});

/**
 * 3. Current Admin Profile
 */
router.get('/auth/me', requireAdminAuth, async (req: Request, res: Response) => {
  const user = await prisma.adminUser.findUnique({
    where: { id: req.admin!.adminId },
    select: { id: true, email: true, name: true, role: true, lastLoginAt: true }
  });
  return res.json({ success: true, user });
});

/**
 * 4. Dashboard KPI Cards
 */
router.get('/stats', requireAdminAuth, async (_req: Request, res: Response) => {
  try {
    const [
      newRequests,
      approvedRequests,
      pickupPending,
      receivedItems,
      refundPending,
      replacementPending,
      totalCompleted
    ] = await Promise.all([
      prisma.returnRequest.count({ where: { status: 'SUBMITTED' } }),
      prisma.returnRequest.count({ where: { status: 'APPROVED' } }),
      prisma.returnRequest.count({ where: { status: 'PICKUP_SCHEDULED' } }),
      prisma.returnRequest.count({ where: { status: 'RECEIVED_AT_WAREHOUSE' } }),
      prisma.returnRequest.count({
        where: {
          requestType: 'RETURN_REFUND',
          status: { in: ['RECEIVED_AT_WAREHOUSE', 'APPROVED'] },
          refundStatus: { not: 'PROCESSED' }
        }
      }),
      prisma.returnRequest.count({
        where: {
          requestType: 'REPLACEMENT',
          status: { in: ['RECEIVED_AT_WAREHOUSE', 'APPROVED'] }
        }
      }),
      prisma.returnRequest.count({ where: { status: 'COMPLETED' } })
    ]);

    return res.json({
      success: true,
      stats: {
        newRequests,
        approvedRequests,
        pickupPending,
        receivedItems,
        refundPending,
        replacementPending,
        totalCompleted
      }
    });
  } catch (err: any) {
    console.error('[Admin Stats Error]:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to fetch statistics.' });
  }
});

/**
 * 5. Request Table with Filters
 */
router.get('/requests', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { status, type, orderNumber, search, page = '1', limit = '20' } = req.query;

    const where: any = {};
    if (status && typeof status === 'string' && status !== 'ALL') {
      where.status = status;
    }
    if (type && typeof type === 'string' && type !== 'ALL') {
      where.requestType = type;
    }
    if (orderNumber && typeof orderNumber === 'string') {
      where.order = { orderNumber: { contains: orderNumber.replace('#', '') } };
    }
    if (search && typeof search === 'string') {
      const clean = search.trim();
      where.OR = [
        { requestNumber: { contains: clean } },
        { order: { orderNumber: { contains: clean.replace('#', '') } } },
        { order: { customerEmail: { contains: clean } } }
      ];
    }

    const take = parseInt(limit as string, 10);
    const skip = (parseInt(page as string, 10) - 1) * take;

    const [total, requests] = await Promise.all([
      prisma.returnRequest.count({ where }),
      prisma.returnRequest.findMany({
        where,
        take,
        skip,
        orderBy: { createdAt: 'desc' },
        include: {
          order: true,
          returnItems: { include: { orderItem: true } },
          replacementItems: true,
          shipments: true
        }
      })
    ]);

    return res.json({
      success: true,
      data: requests.map(r => ({
        id: r.id,
        requestNumber: r.requestNumber,
        orderNumber: `#${r.order.orderNumber}`,
        customerEmail: r.order.customerEmail,
        requestType: r.requestType,
        status: r.status,
        reason: r.reason,
        refundAmount: r.refundAmount,
        currency: r.order.currency,
        itemsCount: r.returnItems.reduce((acc, it) => acc + it.quantity, 0),
        itemsSummary: r.returnItems.map(it => `${it.quantity}x ${it.orderItem.title}`).join(', '),
        createdAt: r.createdAt,
        shipmentStatus: r.shipments[0]?.status || 'NOT_SCHEDULED',
        awbNumber: r.shipments[0]?.awbNumber || null
      })),
      pagination: {
        page: parseInt(page as string, 10),
        limit: take,
        total,
        totalPages: Math.ceil(total / take)
      }
    });
  } catch (err: any) {
    console.error('[Admin Requests Error]:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to fetch requests.' });
  }
});

/**
 * 6. Request Detail Page
 */
router.get('/requests/:id', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const returnRequest = await prisma.returnRequest.findUnique({
      where: { id },
      include: {
        order: {
          include: { items: true }
        },
        returnItems: {
          include: { orderItem: true }
        },
        replacementItems: true,
        uploadedFiles: true,
        shipments: {
          orderBy: { createdAt: 'desc' }
        },
        refunds: {
          orderBy: { createdAt: 'desc' }
        },
        statusEvents: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!returnRequest) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Return request not found.' });
    }

    return res.json({
      success: true,
      request: returnRequest
    });
  } catch (err: any) {
    console.error('[Admin Request Detail Error]:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to load request details.' });
  }
});

/**
 * 7. Admin Action: Approve Request
 */
router.post('/requests/:id/approve', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const request = await prisma.returnRequest.findUnique({
      where: { id },
      include: {
        order: true,
        returnItems: true,
        replacementItems: true
      }
    });

    if (!request) return res.status(404).json({ error: 'NOT_FOUND' });

    // Inventory check if replacement
    if (request.requestType === 'REPLACEMENT') {
      for (const item of request.replacementItems) {
        const stock = await shopifyService.checkVariantStock(item.targetVariantId);
        if (!stock.inStock) {
          return res.status(400).json({
            error: 'INVENTORY_UNAVAILABLE',
            message: `Cannot approve: Replacement item '${item.title} (${item.variantTitle})' is currently out of stock in Shopify.`
          });
        }
      }
    }

    // Call Shopify returnCreate API to register return in Shopify Admin
    let shopifyReturnId: string | null = null;
    try {
      const shopifyRes = await shopifyService.createShopifyReturn(
        request.order.shopifyId,
        request.returnItems.map(ri => ({
          quantity: ri.quantity,
          returnReason: request.reason
        }))
      );
      shopifyReturnId = shopifyRes.returnId;
    } catch (err: any) {
      console.warn(`[Shopify returnCreate Note]: ${err.message}`);
    }

    const updated = await prisma.returnRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        statusEvents: {
          create: {
            status: 'APPROVED',
            actorType: 'ADMIN',
            actorName: req.admin!.email,
            message: `Request approved by Admin. ${shopifyReturnId ? `Shopify Return created (${shopifyReturnId}).` : ''}`
          }
        }
      }
    });

    // Send customer email
    if (request.order.customerEmail) {
      await emailService.sendStatusUpdate({
        toEmail: request.order.customerEmail,
        customerName: request.order.customerEmail.split('@')[0],
        requestNumber: request.requestNumber,
        orderNumber: request.order.orderNumber,
        status: 'APPROVED',
        requestType: request.requestType
      });
    }

    return res.json({ success: true, message: 'Request approved successfully.', request: updated });
  } catch (err: any) {
    console.error('[Admin Approve Error]:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * 8. Admin Action: Reject Request
 */
router.post('/requests/:id/reject', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;

    if (!rejectionReason || rejectionReason.trim().length === 0) {
      return res.status(400).json({ error: 'REASON_REQUIRED', message: 'Rejection reason is required.' });
    }

    const request = await prisma.returnRequest.findUnique({
      where: { id },
      include: { order: true }
    });

    if (!request) return res.status(404).json({ error: 'NOT_FOUND' });

    const updated = await prisma.returnRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectionReason,
        statusEvents: {
          create: {
            status: 'REJECTED',
            actorType: 'ADMIN',
            actorName: req.admin!.email,
            message: `Request rejected: ${rejectionReason}`
          }
        }
      }
    });

    if (request.order.customerEmail) {
      await emailService.sendStatusUpdate({
        toEmail: request.order.customerEmail,
        customerName: request.order.customerEmail.split('@')[0],
        requestNumber: request.requestNumber,
        orderNumber: request.order.orderNumber,
        status: 'REJECTED',
        requestType: request.requestType,
        details: { rejectionReason }
      });
    }

    return res.json({ success: true, message: 'Request rejected.', request: updated });
  } catch (err: any) {
    console.error('[Admin Reject Error]:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * 9. Admin Action: Schedule Reverse Pickup (Shiprocket)
 * Prevents duplicate pickups
 */
router.post('/requests/:id/schedule-pickup', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const request = await prisma.returnRequest.findUnique({
      where: { id },
      include: {
        order: true,
        returnItems: { include: { orderItem: true } },
        shipments: true
      }
    });

    if (!request) return res.status(404).json({ error: 'NOT_FOUND' });

    // Idempotency: Prevent duplicate reverse pickups
    const existingReversePickup = request.shipments.find(s => s.type === 'REVERSE_PICKUP' && s.status !== 'FAILED');
    if (existingReversePickup) {
      return res.status(400).json({
        error: 'DUPLICATE_PICKUP',
        message: `A reverse pickup has already been scheduled (AWB: ${existingReversePickup.awbNumber || 'PENDING'}). Duplicate reverse pickups are forbidden.`
      });
    }

    const shippingAddress = JSON.parse(request.order.shippingAddressJson || '{}');
    const customerAddress = {
      name: shippingAddress.name || request.order.customerEmail || 'Customer',
      address1: shippingAddress.address1 || 'Customer Address',
      address2: shippingAddress.address2 || '',
      city: shippingAddress.city || 'Bengaluru',
      state: shippingAddress.province || 'Karnataka',
      pincode: shippingAddress.zip || '560001',
      phone: request.order.customerPhone || '9876543210',
      email: request.order.customerEmail || ''
    };

    // Schedule reverse pickup via Shiprocket adapter
    const shiprocketResult = await shiprocketService.createReversePickup({
      orderId: request.order.orderNumber,
      requestNumber: request.requestNumber,
      customerAddress,
      items: request.returnItems.map(item => ({
        name: item.orderItem.title,
        sku: item.orderItem.sku || 'SKU-RET',
        units: item.quantity,
        price: item.orderItem.price,
        qcReason: request.reason
      }))
    });

    // Save shipment record and update status
    await prisma.$transaction([
      prisma.shipment.create({
        data: {
          returnRequestId: request.id,
          type: 'REVERSE_PICKUP',
          provider: 'SHIPROCKET',
          shiprocketShipmentId: shiprocketResult.shipmentId,
          shiprocketOrderId: shiprocketResult.orderId,
          awbNumber: shiprocketResult.awbNumber,
          courierName: shiprocketResult.courierName,
          trackingUrl: shiprocketResult.trackingUrl,
          status: 'SCHEDULED',
          pickupAddressJson: JSON.stringify(customerAddress)
        }
      }),
      prisma.returnRequest.update({
        where: { id },
        data: {
          status: 'PICKUP_SCHEDULED',
          statusEvents: {
            create: {
              status: 'PICKUP_SCHEDULED',
              actorType: 'ADMIN',
              actorName: req.admin!.email,
              message: `Reverse pickup scheduled via ${shiprocketResult.courierName} (AWB: ${shiprocketResult.awbNumber}). ${shiprocketResult.isMock ? '[Demo Mode: Simulated AWB]' : ''}`
            }
          }
        }
      })
    ]);

    // Send customer email
    if (request.order.customerEmail) {
      await emailService.sendStatusUpdate({
        toEmail: request.order.customerEmail,
        customerName: customerAddress.name,
        requestNumber: request.requestNumber,
        orderNumber: request.order.orderNumber,
        status: 'PICKUP_SCHEDULED',
        requestType: request.requestType,
        details: {
          courier: shiprocketResult.courierName,
          awb: shiprocketResult.awbNumber,
          trackingUrl: shiprocketResult.trackingUrl
        }
      });
    }

    return res.json({
      success: true,
      message: 'Reverse pickup scheduled successfully.',
      shipment: shiprocketResult
    });
  } catch (err: any) {
    console.error('[Schedule Reverse Pickup Error]:', err);
    return res.status(500).json({ error: 'PICKUP_FAILED', message: err.message });
  }
});

/**
 * 10. Admin Action: Mark Item Received at Warehouse
 */
router.post('/requests/:id/mark-received', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const request = await prisma.returnRequest.findUnique({
      where: { id },
      include: { order: true }
    });

    if (!request) return res.status(404).json({ error: 'NOT_FOUND' });

    const updated = await prisma.returnRequest.update({
      where: { id },
      data: {
        status: 'RECEIVED_AT_WAREHOUSE',
        statusEvents: {
          create: {
            status: 'RECEIVED_AT_WAREHOUSE',
            actorType: 'ADMIN',
            actorName: req.admin!.email,
            message: 'Returned product received and inspected at warehouse.'
          }
        }
      }
    });

    if (request.order.customerEmail) {
      await emailService.sendStatusUpdate({
        toEmail: request.order.customerEmail,
        customerName: request.order.customerEmail.split('@')[0],
        requestNumber: request.requestNumber,
        orderNumber: request.order.orderNumber,
        status: 'RECEIVED_AT_WAREHOUSE',
        requestType: request.requestType
      });
    }

    return res.json({ success: true, message: 'Item marked as received at warehouse.', request: updated });
  } catch (err: any) {
    console.error('[Mark Received Error]:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * 11. Admin Action: Process Refund
 * Business rule: Never refund more than the eligible amount
 */
router.post('/requests/:id/process-refund', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { method, amount, notes } = req.body;

    const request = await prisma.returnRequest.findUnique({
      where: { id },
      include: {
        order: true,
        returnItems: true,
        refunds: true
      }
    });

    if (!request) return res.status(404).json({ error: 'NOT_FOUND' });

    // Calculate maximum allowable refund
    const maxRefund = request.returnItems.reduce((acc, it) => acc + (it.refundAmount || 0), 0);
    const refundAmount = amount ? parseFloat(amount) : maxRefund;

    if (refundAmount > maxRefund) {
      return res.status(400).json({
        error: 'REFUND_EXCEEDS_MAX',
        message: `Refund amount (₹${refundAmount}) cannot exceed the eligible item amount (₹${maxRefund}).`
      });
    }

    // Call Shopify GraphQL refundCreate if method is ORIGINAL_PAYMENT
    let shopifyRefundId: string | null = null;
    const chosenMethod = method || request.refundMethod || 'ORIGINAL_PAYMENT';

    if (chosenMethod === 'ORIGINAL_PAYMENT') {
      try {
        const result = await shopifyService.processShopifyRefund(
          request.order.shopifyId,
          refundAmount,
          request.order.currency,
          `Refund for return request ${request.requestNumber}`
        );
        shopifyRefundId = result.refundId;
      } catch (err: any) {
        console.warn(`[Shopify Refund Warning]: ${err.message}`);
      }
    }

    // Record refund in DB and update request status
    await prisma.$transaction([
      prisma.refund.create({
        data: {
          returnRequestId: request.id,
          amount: refundAmount,
          currency: request.order.currency,
          method: chosenMethod,
          status: 'SUCCESS',
          shopifyRefundId,
          notes,
          processedAt: new Date()
        }
      }),
      prisma.returnRequest.update({
        where: { id },
        data: {
          status: 'REFUND_PROCESSED',
          refundStatus: 'PROCESSED',
          refundMethod: chosenMethod,
          refundAmount,
          statusEvents: {
            create: {
              status: 'REFUND_PROCESSED',
              actorType: 'ADMIN',
              actorName: req.admin!.email,
              message: `Refund of ₹${refundAmount} processed via ${chosenMethod}. ${shopifyRefundId ? `(Shopify Refund ID: ${shopifyRefundId})` : ''}`
            }
          }
        }
      })
    ]);

    if (request.order.customerEmail) {
      await emailService.sendStatusUpdate({
        toEmail: request.order.customerEmail,
        customerName: request.order.customerEmail.split('@')[0],
        requestNumber: request.requestNumber,
        orderNumber: request.order.orderNumber,
        status: 'REFUND_PROCESSED',
        requestType: request.requestType,
        details: { amount: refundAmount, method: chosenMethod }
      });
    }

    return res.json({ success: true, message: `Refund of ₹${refundAmount} processed successfully.` });
  } catch (err: any) {
    console.error('[Process Refund Error]:', err);
    return res.status(500).json({ error: 'REFUND_ERROR', message: err.message });
  }
});

/**
 * 12. Admin Action: Create Replacement Shipment
 * Business rule: Never create duplicate replacement shipments
 */
router.post('/requests/:id/create-replacement', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const request = await prisma.returnRequest.findUnique({
      where: { id },
      include: {
        order: true,
        replacementItems: true,
        shipments: true
      }
    });

    if (!request) return res.status(404).json({ error: 'NOT_FOUND' });

    // Idempotency: Prevent duplicate forward replacement shipments
    const existingForwardShipment = request.shipments.find(s => s.type === 'FORWARD_REPLACEMENT' && s.status !== 'FAILED');
    if (existingForwardShipment) {
      return res.status(400).json({
        error: 'DUPLICATE_SHIPMENT',
        message: `A replacement shipment has already been created (AWB: ${existingForwardShipment.awbNumber || 'PENDING'}). Duplicate forward shipments are forbidden.`
      });
    }

    // Verify inventory check
    for (const item of request.replacementItems) {
      const stock = await shopifyService.checkVariantStock(item.targetVariantId);
      if (!stock.inStock) {
        return res.status(400).json({
          error: 'OUT_OF_STOCK',
          message: `Cannot dispatch: Item '${item.title} (${item.variantTitle})' is out of stock in Shopify inventory.`
        });
      }
    }

    const shippingAddress = JSON.parse(request.order.shippingAddressJson || '{}');
    const customerAddress = {
      name: shippingAddress.name || 'Customer',
      address1: shippingAddress.address1 || '',
      address2: shippingAddress.address2 || '',
      city: shippingAddress.city || 'Bengaluru',
      state: shippingAddress.province || 'Karnataka',
      pincode: shippingAddress.zip || '560001',
      phone: request.order.customerPhone || '9876543210',
      email: request.order.customerEmail || ''
    };

    const shiprocketResult = await shiprocketService.createReplacementShipment({
      orderId: request.order.orderNumber,
      requestNumber: request.requestNumber,
      customerAddress,
      items: request.replacementItems.map(item => ({
        name: item.title,
        sku: `REP-${item.targetVariantId.slice(-6)}`,
        units: item.quantity,
        price: 0 // Replacement dispatched at ₹0 prepaid
      }))
    });

    await prisma.$transaction([
      prisma.shipment.create({
        data: {
          returnRequestId: request.id,
          type: 'FORWARD_REPLACEMENT',
          provider: 'SHIPROCKET',
          shiprocketShipmentId: shiprocketResult.shipmentId,
          shiprocketOrderId: shiprocketResult.orderId,
          awbNumber: shiprocketResult.awbNumber,
          courierName: shiprocketResult.courierName,
          trackingUrl: shiprocketResult.trackingUrl,
          status: 'MANIFESTED'
        }
      }),
      prisma.returnRequest.update({
        where: { id },
        data: {
          status: 'REPLACEMENT_SHIPPED',
          statusEvents: {
            create: {
              status: 'REPLACEMENT_SHIPPED',
              actorType: 'ADMIN',
              actorName: req.admin!.email,
              message: `Replacement dispatched via ${shiprocketResult.courierName} (AWB: ${shiprocketResult.awbNumber}). ${shiprocketResult.isMock ? '[Demo Mode: Simulated AWB]' : ''}`
            }
          }
        }
      })
    ]);

    if (request.order.customerEmail) {
      await emailService.sendStatusUpdate({
        toEmail: request.order.customerEmail,
        customerName: customerAddress.name,
        requestNumber: request.requestNumber,
        orderNumber: request.order.orderNumber,
        status: 'REPLACEMENT_SHIPPED',
        requestType: request.requestType,
        details: {
          courier: shiprocketResult.courierName,
          awb: shiprocketResult.awbNumber,
          trackingUrl: shiprocketResult.trackingUrl
        }
      });
    }

    return res.json({
      success: true,
      message: 'Replacement shipment created and dispatched.',
      shipment: shiprocketResult
    });
  } catch (err: any) {
    console.error('[Create Replacement Shipment Error]:', err);
    return res.status(500).json({ error: 'SHIPMENT_FAILED', message: err.message });
  }
});

/**
 * 13. Admin Action: Close Request
 */
router.post('/requests/:id/close', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const request = await prisma.returnRequest.findUnique({
      where: { id },
      include: { order: true }
    });

    if (!request) return res.status(404).json({ error: 'NOT_FOUND' });

    const updated = await prisma.returnRequest.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        statusEvents: {
          create: {
            status: 'COMPLETED',
            actorType: 'ADMIN',
            actorName: req.admin!.email,
            message: 'Request closed as Completed by Admin.'
          }
        }
      }
    });

    if (request.order.customerEmail) {
      await emailService.sendStatusUpdate({
        toEmail: request.order.customerEmail,
        customerName: request.order.customerEmail.split('@')[0],
        requestNumber: request.requestNumber,
        orderNumber: request.order.orderNumber,
        status: 'COMPLETED',
        requestType: request.requestType
      });
    }

    return res.json({ success: true, message: 'Request closed as completed.', request: updated });
  } catch (err: any) {
    console.error('[Close Request Error]:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * 14. Admin Action: Add Internal Notes
 */
router.post('/requests/:id/notes', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const updated = await prisma.returnRequest.update({
      where: { id },
      data: {
        internalNotes: notes,
        statusEvents: {
          create: {
            status: 'INTERNAL_NOTE',
            actorType: 'ADMIN',
            actorName: req.admin!.email,
            message: `Internal note added: ${notes}`
          }
        }
      }
    });

    return res.json({ success: true, message: 'Internal note saved.', request: updated });
  } catch (err: any) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * 15. Store Settings Management
 */
router.get('/settings', requireAdminAuth, async (_req: Request, res: Response) => {
  try {
    let setting = await prisma.setting.findFirst();
    if (!setting) {
      let store = await prisma.store.findFirst();
      if (!store) {
        store = await prisma.store.create({
          data: {
            shopDomain: 'ethnoirindia.myshopify.com',
            shopName: 'Ethnoir India'
          }
        });
      }
      setting = await prisma.setting.create({
        data: {
          storeId: store.id,
          returnWindowDays: 7,
          autoApproveReturns: false,
          requirePhotoUpload: true,
          defaultRefundMethod: 'ORIGINAL_PAYMENT',
          shiprocketPickupName: 'Primary Warehouse',
          returnPolicyContent: 'Returns are accepted within 7 days of delivery for unworn, unwashed items with original tags intact. Final sale items and accessories are non-returnable.'
        }
      });
    }

    return res.json({ success: true, settings: setting });
  } catch (err: any) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

router.put('/settings', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { returnWindowDays, autoApproveReturns, requirePhotoUpload, defaultRefundMethod, returnPolicyContent, shiprocketPickupName } = req.body;

    let setting = await prisma.setting.findFirst();
    if (!setting) {
      const store = await prisma.store.findFirst();
      setting = await prisma.setting.create({
        data: {
          storeId: store!.id,
          returnWindowDays: returnWindowDays || 7,
          autoApproveReturns: Boolean(autoApproveReturns),
          requirePhotoUpload: Boolean(requirePhotoUpload),
          defaultRefundMethod: defaultRefundMethod || 'ORIGINAL_PAYMENT',
          returnPolicyContent,
          shiprocketPickupName
        }
      });
    } else {
      setting = await prisma.setting.update({
        where: { id: setting.id },
        data: {
          returnWindowDays: returnWindowDays !== undefined ? parseInt(returnWindowDays, 10) : setting.returnWindowDays,
          autoApproveReturns: autoApproveReturns !== undefined ? Boolean(autoApproveReturns) : setting.autoApproveReturns,
          requirePhotoUpload: requirePhotoUpload !== undefined ? Boolean(requirePhotoUpload) : setting.requirePhotoUpload,
          defaultRefundMethod: defaultRefundMethod || setting.defaultRefundMethod,
          returnPolicyContent: returnPolicyContent !== undefined ? returnPolicyContent : setting.returnPolicyContent,
          shiprocketPickupName: shiprocketPickupName !== undefined ? shiprocketPickupName : setting.shiprocketPickupName
        }
      });
    }

    return res.json({ success: true, message: 'Settings updated successfully.', settings: setting });
  } catch (err: any) {
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * 16. Integration Diagnostics: Shopify & Shiprocket Status Check
 */
router.get('/integrations/status', requireAdminAuth, async (_req: Request, res: Response) => {
  const shopifyConfigured = config.isShopifyConfigured();
  const shiprocketConfigured = config.isShiprocketConfigured();

  const shopifyCheck = await shopifyService.testConnection();
  const shiprocketCheck = await shiprocketService.testConnection();

  return res.json({
    success: true,
    shopify: {
      isConfigured: shopifyConfigured,
      shopDomain: config.SHOPIFY_SHOP,
      apiVersion: config.SHOPIFY_API_VERSION,
      connected: shopifyCheck.success,
      message: shopifyCheck.message,
      storeName: shopifyCheck.shopName
    },
    shiprocket: {
      isConfigured: shiprocketConfigured,
      apiBase: config.SHIPROCKET_API_BASE,
      email: config.SHIPROCKET_EMAIL || 'Not configured',
      connected: shiprocketCheck.success,
      message: shiprocketCheck.message
    }
  });
});

export default router;
