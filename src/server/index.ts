import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { prisma } from './db.js';

// Route imports
import customerRoutes from './routes/customer.js';
import adminRoutes from './routes/admin.js';
import uploadRoutes from './routes/upload.js';
import webhookRoutes from './routes/webhooks.js';

const app = express();

// 1. Security Headers
app.use(helmet({
  contentSecurityPolicy: false, // Allows flexible media rendering in modern dynamic dashboard
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// 2. CORS
app.use(cors({
  origin: true,
  credentials: true
}));

// 3. Cookie Parser
app.use(cookieParser());

// 4. Capture Raw Body for Webhook Signature Verification
app.use(express.json({
  limit: '10mb',
  verify: (req: Request, _res: Response, buf: Buffer) => {
    (req as any).rawBody = buf;
  }
}));

app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 5. Serve Uploaded Product Photos Statically
const uploadsPath = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
app.use('/uploads', express.static(uploadsPath));

// 6. Mount API Routes
app.use('/api/customer', customerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/webhooks', webhookRoutes);

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    store: config.SHOPIFY_SHOP,
    apiVersion: config.SHOPIFY_API_VERSION,
    shopifyConfigured: config.isShopifyConfigured(),
    shiprocketConfigured: config.isShiprocketConfigured(),
    timestamp: new Date().toISOString()
  });
});

// 7. Serve Frontend if built
const clientDist = path.resolve(process.cwd(), 'dist/client');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
      return res.sendFile(path.join(clientDist, 'index.html'));
    }
    next();
  });
}

// 8. Global Error Handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Unhandled Global Error]:', err);
  const status = err.status || 500;
  res.status(status).json({
    error: 'SERVER_ERROR',
    message: err.message || 'An unexpected error occurred. Please contact support.'
  });
});

// Seed default settings and initial admin on startup
async function bootstrap() {
  try {
    // 1. Ensure default store & settings exist
    let store = await prisma.store.findFirst({
      where: { shopDomain: config.SHOPIFY_SHOP },
      include: { settings: true }
    });

    if (!store) {
      store = await prisma.store.create({
        data: {
          shopDomain: config.SHOPIFY_SHOP,
          shopName: 'Ethnoir India',
          apiVersion: config.SHOPIFY_API_VERSION,
          settings: {
            create: {
              returnWindowDays: config.RETURN_WINDOW_DAYS,
              autoApproveReturns: false,
              requirePhotoUpload: true,
              defaultRefundMethod: 'ORIGINAL_PAYMENT',
              shiprocketPickupName: config.SHIPROCKET_PICKUP_LOCATION_NAME,
              returnPolicyContent: 'Returns accepted within 7 days of delivery for unused ethnic wear with tags attached.'
            }
          }
        },
        include: { settings: true }
      });
      console.log(`[Bootstrap] Initialized store: ${config.SHOPIFY_SHOP}`);
    }

    // 2. Ensure initial admin user exists
    const adminCount = await prisma.adminUser.count();
    if (adminCount === 0) {
      const passwordHash = await bcrypt.hash(config.ADMIN_DEFAULT_PASSWORD, 10);
      await prisma.adminUser.create({
        data: {
          email: config.ADMIN_DEFAULT_EMAIL,
          passwordHash,
          name: 'Store Administrator',
          role: 'ADMIN'
        }
      });
      console.log(`[Bootstrap] Created initial admin: ${config.ADMIN_DEFAULT_EMAIL}`);
    }

    // Start listening
    const port = config.PORT;
    app.listen(port, () => {
      console.log(`\n======================================================`);
      console.log(`🚀 Ethnoir Return & Replacement Server running on :${port}`);
      console.log(`🏪 Store: ${config.SHOPIFY_SHOP} (GraphQL API: ${config.SHOPIFY_API_VERSION})`);
      console.log(`📦 Shiprocket Base: ${config.SHIPROCKET_API_BASE}`);
      console.log(`Mode: PRODUCTION (Shopify GraphQL 2026-07 + Shiprocket Logistics)`);
      console.log(`Default Admin: ${config.ADMIN_DEFAULT_EMAIL}`);
      console.log(`======================================================\n`);
    });
  } catch (err: any) {
    console.error('[Bootstrap Error]:', err);
  }
}

bootstrap();

export default app;
