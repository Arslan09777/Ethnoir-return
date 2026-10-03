-- ==============================================================================
-- ETHNOIR Return & Replacement Application
-- Migration 04: Functions, Triggers & Performance Indexes
-- Brand: ETHNOIR (ethnoirindia.myshopify.com)
-- ==============================================================================

-- 1. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_return_requests_reference_number ON public.return_requests(reference_number);
CREATE INDEX IF NOT EXISTS idx_return_requests_shopify_order_id ON public.return_requests(shopify_order_id);
CREATE INDEX IF NOT EXISTS idx_return_requests_customer_email ON public.return_requests(customer_email);
CREATE INDEX IF NOT EXISTS idx_return_requests_status ON public.return_requests(status);
CREATE INDEX IF NOT EXISTS idx_return_requests_created_at ON public.return_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_return_requests_shiprocket_awb ON public.return_requests(shiprocket_awb);
CREATE INDEX IF NOT EXISTS idx_webhook_events_external_event_id ON public.webhook_events(external_event_id);

CREATE INDEX IF NOT EXISTS idx_return_items_request_id ON public.return_items(return_request_id);
CREATE INDEX IF NOT EXISTS idx_return_items_line_item_id ON public.return_items(shopify_line_item_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_request_id ON public.uploaded_files(return_request_id);
CREATE INDEX IF NOT EXISTS idx_shipments_request_id ON public.shipments(return_request_id);
CREATE INDEX IF NOT EXISTS idx_refunds_request_id ON public.refunds(return_request_id);
CREATE INDEX IF NOT EXISTS idx_status_events_request_id ON public.status_events(return_request_id);

-- 2. Unique Sequential Reference Generator: RET-YYYY-0001
CREATE SEQUENCE IF NOT EXISTS public.return_request_reference_seq START 1;

CREATE OR REPLACE FUNCTION public.generate_next_return_reference()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_year TEXT;
  v_next_val BIGINT;
  v_ref TEXT;
BEGIN
  v_year := to_char(CURRENT_DATE, 'YYYY');
  v_next_val := nextval('public.return_request_reference_seq');
  v_ref := 'RET-' || v_year || '-' || lpad(v_next_val::text, 4, '0');
  RETURN v_ref;
END;
$$;

-- 3. Check whether order item is already under an active return
CREATE OR REPLACE FUNCTION public.check_item_active_return(p_shopify_line_item_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.return_items ri
    JOIN public.return_requests rr ON rr.id = ri.return_request_id
    WHERE ri.shopify_line_item_id = p_shopify_line_item_id
      AND rr.status NOT IN ('rejected', 'cancelled')
  );
$$;

-- 4. Prevent duplicate refund processing trigger
CREATE OR REPLACE FUNCTION public.prevent_duplicate_refund()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.refunds
    WHERE return_request_id = NEW.return_request_id
      AND status IN ('completed', 'processing')
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) THEN
    RAISE EXCEPTION 'A completed or processing refund already exists for return request %', NEW.return_request_id;
  END IF;
  RETURN NEW;
END;
$$;

-- 5. Prevent duplicate reverse pickup / shipment creation trigger
CREATE OR REPLACE FUNCTION public.prevent_duplicate_shipment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.direction = 'reverse' AND EXISTS (
    SELECT 1 FROM public.shipments
    WHERE return_request_id = NEW.return_request_id
      AND direction = 'reverse'
      AND status NOT IN ('cancelled', 'failed')
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) THEN
    RAISE EXCEPTION 'An active reverse shipment already exists for return request %', NEW.return_request_id;
  END IF;
  RETURN NEW;
END;
$$;

-- 6. Add status_event automatically whenever status changes
CREATE OR REPLACE FUNCTION public.log_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.status_events (
      return_request_id,
      old_status,
      new_status,
      actor_type,
      actor_id,
      note
    ) VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      'system',
      'trigger',
      'Status automatically transitioned from ' || COALESCE(OLD.status, 'none') || ' to ' || NEW.status
    );
  END IF;
  RETURN NEW;
END;
$$;

-- 7. Return dashboard counts by status
CREATE OR REPLACE FUNCTION public.get_dashboard_counts()
RETURNS TABLE (
  status TEXT,
  count BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    s.status,
    COALESCE(COUNT(r.id), 0)::BIGINT AS count
  FROM (
    VALUES 
      ('submitted'),
      ('under_review'),
      ('approved'),
      ('rejected'),
      ('pickup_scheduled'),
      ('picked_up'),
      ('received'),
      ('refund_pending'),
      ('refund_completed'),
      ('replacement_pending'),
      ('replacement_shipped'),
      ('completed'),
      ('cancelled')
  ) AS s(status)
  LEFT JOIN public.return_requests r ON r.status = s.status
  GROUP BY s.status
  ORDER BY s.status;
$$;
