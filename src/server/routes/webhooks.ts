import { Router, Request, Response } from 'express';
import { prisma } from '../db.js';
import { ShopifyService } from '../services/shopify.js';

const router = Router();

/**
 * Shopify Webhook Handler
 * Verifies HMAC signature, checks idempotency using webhook event ID, and updates records
 */
router.post('/shopify', async (req: Request, res: Response) => {
  const hmac = req.headers['x-shopify-hmac-sha256'] as string;
  const topic = req.headers['x-shopify-topic'] as string;
  const shopDomain = req.headers['x-shopify-shop-domain'] as string;
  const webhookId = req.headers['x-shopify-webhook-id'] as string;

  // Raw body verification
  const rawBody = (req as any).rawBody || JSON.stringify(req.body);
  const isValid = ShopifyService.verifyWebhookHmac(rawBody, hmac);

  if (!isValid) {
    console.warn(`[Shopify Webhook] Invalid HMAC signature for topic: ${topic}`);
    return res.status(401).send('Invalid signature');
  }

  // Idempotency check: Don't process duplicate webhook events
  if (webhookId) {
    const existing = await prisma.webhookEvent.findUnique({ where: { eventId: webhookId } });
    if (existing) {
      return res.status(200).send('Already processed');
    }
  }

  // Record incoming webhook
  const eventRecord = await prisma.webhookEvent.create({
    data: {
      source: 'SHOPIFY',
      topic: topic || 'unknown',
      eventId: webhookId || `wh_${Date.now()}`,
      payloadJson: typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    }
  });

  const payload = req.body;

  try {
    switch (topic) {
      case 'orders/fulfilled': {
        const orderNumber = payload.name?.replace(/[^0-9]/g, '');
        if (orderNumber) {
          const fulfillmentDate = payload.fulfillments?.[0]?.created_at || new Date().toISOString();
          await prisma.order.updateMany({
            where: { orderNumber },
            data: {
              fulfillmentStatus: 'FULFILLED',
              deliveryDate: new Date(fulfillmentDate)
            }
          });
        }
        break;
      }

      case 'orders/cancelled': {
        const orderNumber = payload.name?.replace(/[^0-9]/g, '');
        if (orderNumber) {
          await prisma.order.updateMany({
            where: { orderNumber },
            data: { fulfillmentStatus: 'CANCELLED' }
          });
        }
        break;
      }

      case 'refunds/create': {
        console.log(`[Shopify Webhook] Refund recorded for order ${payload.order_id}`);
        break;
      }

      case 'products/update': {
        console.log(`[Shopify Webhook] Product updated in catalog: ${payload.id}`);
        break;
      }

      case 'inventory_levels/update': {
        console.log(`[Shopify Webhook] Inventory level update: item ${payload.inventory_item_id}`);
        break;
      }

      case 'app/uninstalled': {
        if (shopDomain) {
          await prisma.store.updateMany({
            where: { shopDomain },
            data: { isActive: false }
          });
        }
        break;
      }

      default:
        console.log(`[Shopify Webhook] Received unhandled topic: ${topic}`);
    }

    await prisma.webhookEvent.update({
      where: { id: eventRecord.id },
      data: { processed: true, processedAt: new Date() }
    });

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error(`[Shopify Webhook Error]:`, err);
    await prisma.webhookEvent.update({
      where: { id: eventRecord.id },
      data: { error: err.message }
    });
    return res.status(500).send('Processing error');
  }
});

/**
 * Shiprocket Tracking Webhook Handler
 */
router.post('/shiprocket', async (req: Request, res: Response) => {
  const payload = req.body;
  const awb = payload.awb || payload.awb_code;

  if (!awb) {
    return res.status(400).send('Missing AWB');
  }

  try {
    const shipment = await prisma.shipment.findUnique({
      where: { awbNumber: awb },
      include: { returnRequest: true }
    });

    if (shipment) {
      const currentStatus = (payload.current_status || payload.status || '').toUpperCase();
      let newRequestStatus: string | null = null;

      if (shipment.type === 'REVERSE_PICKUP') {
        if (currentStatus.includes('PICKED UP') || currentStatus === 'IN_TRANSIT') {
          newRequestStatus = 'PICKED_UP';
        } else if (currentStatus.includes('DELIVERED') || currentStatus.includes('RECEIVED')) {
          newRequestStatus = 'RECEIVED_AT_WAREHOUSE';
        }
      }

      await prisma.shipment.update({
        where: { id: shipment.id },
        data: { status: currentStatus }
      });

      if (newRequestStatus && shipment.returnRequest) {
        await prisma.returnRequest.update({
          where: { id: shipment.returnRequestId },
          data: {
            status: newRequestStatus,
            statusEvents: {
              create: {
                status: newRequestStatus,
                actorType: 'SHIPROCKET_WEBHOOK',
                message: `Shiprocket tracking update: Status is now ${currentStatus}`
              }
            }
          }
        });
      }
    }

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('[Shiprocket Webhook Error]:', err);
    return res.status(500).send('Processing error');
  }
});

export default router;
