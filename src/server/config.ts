import dotenv from 'dotenv';
import path from 'path';

// Load .env file
dotenv.config();

// Ensure DATABASE_URL fallback exists in process.env for Prisma
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./dev.db';
}

export const config = {
  // Shopify
  SHOPIFY_SHOP: process.env.SHOPIFY_SHOP || 'ethnoirindia.myshopify.com',
  SHOPIFY_API_VERSION: process.env.SHOPIFY_API_VERSION || '2026-07',
  SHOPIFY_CLIENT_ID: process.env.SHOPIFY_CLIENT_ID || '',
  SHOPIFY_CLIENT_SECRET: process.env.SHOPIFY_CLIENT_SECRET || '',
  SHOPIFY_ADMIN_ACCESS_TOKEN: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '',

  // Shiprocket
  SHIPROCKET_API_BASE: process.env.SHIPROCKET_API_BASE || 'https://apiv2.shiprocket.in/v1/external',
  SHIPROCKET_EMAIL: process.env.SHIPROCKET_EMAIL || '',
  SHIPROCKET_PASSWORD: process.env.SHIPROCKET_PASSWORD || '',
  SHIPROCKET_PICKUP_LOCATION_NAME: process.env.SHIPROCKET_PICKUP_LOCATION_NAME || 'Primary Warehouse',

  // App & Security
  PORT: parseInt(process.env.PORT || '5000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: process.env.DATABASE_URL || 'file:./dev.db',
  SESSION_SECRET: process.env.SESSION_SECRET || 'ethnoir-secret-key-change-in-production-2026',
  APP_URL: process.env.APP_URL || 'http://localhost:3000',

  // Policy rules
  RETURN_WINDOW_DAYS: parseInt(process.env.RETURN_WINDOW_DAYS || '7', 10),
  MAX_UPLOAD_SIZE_MB: parseInt(process.env.MAX_UPLOAD_SIZE_MB || '5', 10),

  // Supabase Configuration
  SUPABASE_URL: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://dtcuijwuicsfnlzdatsm.supabase.co',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',

  // Helper flags
  isShopifyConfigured: (): boolean => {
    return Boolean(
      (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN &&
      process.env.SHOPIFY_ADMIN_ACCESS_TOKEN.trim().length > 10) ||
      (process.env.SHOPIFY_CLIENT_ID &&
      process.env.SHOPIFY_CLIENT_SECRET &&
      process.env.SHOPIFY_CLIENT_SECRET.startsWith('shpss_'))
    );
  },

  isShiprocketConfigured: (): boolean => {
    return Boolean(
      process.env.SHIPROCKET_EMAIL &&
      process.env.SHIPROCKET_PASSWORD &&
      process.env.SHIPROCKET_EMAIL.includes('@')
    );
  }
};
