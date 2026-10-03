-- ==============================================================================
-- ETHNOIR Return & Replacement Application
-- Migration 01: Initial Schema
-- Brand: ETHNOIR (ethnoirindia.myshopify.com)
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. admin_users
CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'manager', 'staff')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. return_requests
CREATE TABLE IF NOT EXISTS public.return_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number TEXT NOT NULL UNIQUE,
  shopify_order_id TEXT NOT NULL,
  shopify_order_name TEXT NOT NULL,
  customer_id TEXT,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  request_type TEXT NOT NULL CHECK (request_type IN ('return', 'refund', 'replacement', 'exchange')),
  reason TEXT NOT NULL,
  customer_note TEXT,
  pickup_address JSONB,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (
    status IN (
      'submitted',
      'under_review',
      'approved',
      'rejected',
      'pickup_scheduled',
      'picked_up',
      'received',
      'refund_pending',
      'refund_completed',
      'replacement_pending',
      'replacement_shipped',
      'completed',
      'cancelled'
    )
  ),
  refund_amount NUMERIC(10, 2) DEFAULT 0.00,
  currency TEXT NOT NULL DEFAULT 'INR',
  shiprocket_shipment_id TEXT,
  shiprocket_awb TEXT,
  tracking_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. return_items
CREATE TABLE IF NOT EXISTS public.return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_request_id UUID NOT NULL REFERENCES public.return_requests(id) ON DELETE CASCADE,
  shopify_line_item_id TEXT NOT NULL,
  shopify_variant_id TEXT,
  product_title TEXT NOT NULL,
  variant_title TEXT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  replacement_variant_id TEXT,
  replacement_variant_title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. uploaded_files
CREATE TABLE IF NOT EXISTS public.uploaded_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_request_id UUID NOT NULL REFERENCES public.return_requests(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. shipments
CREATE TABLE IF NOT EXISTS public.shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_request_id UUID NOT NULL REFERENCES public.return_requests(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'shiprocket',
  direction TEXT NOT NULL CHECK (direction IN ('reverse', 'forward')),
  shipment_id TEXT NOT NULL,
  awb TEXT,
  courier_name TEXT,
  tracking_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. refunds
CREATE TABLE IF NOT EXISTS public.refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_request_id UUID NOT NULL REFERENCES public.return_requests(id) ON DELETE CASCADE,
  shopify_refund_id TEXT,
  amount NUMERIC(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  failure_reason TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7. status_events
CREATE TABLE IF NOT EXISTS public.status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_request_id UUID NOT NULL REFERENCES public.return_requests(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('customer', 'admin', 'system', 'webhook')),
  actor_id TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 8. policy_settings
CREATE TABLE IF NOT EXISTS public.policy_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_window_days INTEGER NOT NULL DEFAULT 7 CHECK (return_window_days >= 0),
  replacement_enabled BOOLEAN NOT NULL DEFAULT true,
  exchange_enabled BOOLEAN NOT NULL DEFAULT true,
  refund_enabled BOOLEAN NOT NULL DEFAULT true,
  non_returnable_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 9. webhook_events
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('shopify', 'shiprocket')),
  event_type TEXT NOT NULL,
  external_event_id TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
