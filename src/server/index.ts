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

import { generalApiLimiter } from './middleware/rateLimit.js';

const app = express();

// 1. Security Headers
app.use(helmet({
  contentSecurityPolicy: false, // Allows flexible media rendering in modern dynamic dashboard
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'sameorigin' },
  hidePoweredBy: true,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  ieNoOpen: true,
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true
}));

// 2. CORS - Restrict origins in production
const allowedOrigins = [
  'https://ethnoir.in',
  'https://www.ethnoir.in',
  config.APP_URL,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (server-to-server, webhooks, tools) or same-origin
    if (!origin) return callback(null, true);

    // In local development or testing, permit localhost and loopback origins
    if (process.env.NODE_ENV !== 'production') {
      if (/^https?:\/\/localhost(:\d+)?$/.test(origin) || /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
    }

    // Allow Vercel preview/production domains and Render domains
    try {
      const { hostname } = new URL(origin);
      if (hostname.endsWith('.vercel.app') || hostname.endsWith('.onrender.com')) {
        return callback(null, true);
      }
    } catch {
      // ignore url parse failure
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('CORS_ORIGIN_NOT_ALLOWED'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

// 3. Rate Limiting for all API routes
app.use('/api', generalApiLimiter);

// 4. Cookie Parser
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
  if (err.message === 'CORS_ORIGIN_NOT_ALLOWED') {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Access denied by CORS security policy.'
    });
  }

  console.error('[Unhandled Global Error]:', err?.message || err);
  const status = typeof err.status === 'number' && err.status >= 400 && err.status <= 599 ? err.status : 500;

  // Never leak internal stack traces or internal DB details to clients in production
  const isProd = process.env.NODE_ENV === 'production';
  const message = isProd && status === 500
    ? 'An unexpected error occurred. Please contact support.'
    : (err.message || 'An unexpected error occurred.');

  res.status(status).json({
    error: err.code || 'SERVER_ERROR',
    message
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
          shopName: 'ETHNOIR',
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

    // Start listening
    const port = config.PORT;
    if (!process.env.VERCEL) {
      app.listen(port, () => {
        console.log(`\n======================================================`);
        console.log(`🚀 ETHNOIR Return & Replacement Server running on :${port}`);
        console.log(`🏪 Store: ${config.SHOPIFY_SHOP}`);
        console.log(`🔐 Admin Auth: Supabase Auth (Active)`);
        console.log(`======================================================\n`);
      });
    }
  } catch (err: any) {
    console.error('[Bootstrap Error]:', err);
  }
}

if (!process.env.VERCEL) {
  bootstrap();
}

export default app;
