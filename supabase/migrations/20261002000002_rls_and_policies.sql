-- ==============================================================================
-- ETHNOIR Return & Replacement Application
-- Migration 02: Row Level Security & Policies
-- Brand: ETHNOIR (ethnoirindia.myshopify.com)
-- ==============================================================================

-- Enable RLS on all 9 application tables
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uploaded_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- Helper function: is_active_admin
CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
      AND is_active = true
      AND role IN ('admin', 'manager')
  );
$$;

-- 1. admin_users policies
CREATE POLICY "Admins can view and manage admin users"
ON public.admin_users
FOR ALL
TO authenticated
USING (public.is_active_admin())
WITH CHECK (public.is_active_admin());

CREATE POLICY "Users can view their own admin profile"
ON public.admin_users
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 2. return_requests policies
CREATE POLICY "Customers can view their own return requests"
ON public.return_requests
FOR SELECT
TO authenticated
USING (
  customer_id = auth.uid()::text 
  OR customer_email = (auth.jwt() ->> 'email')
);

CREATE POLICY "Customers can create new return requests"
ON public.return_requests
FOR INSERT
TO authenticated
WITH CHECK (
  status = 'submitted' 
  AND (
    customer_id = auth.uid()::text 
    OR customer_email = (auth.jwt() ->> 'email')
  )
);

CREATE POLICY "Admins have full access to return requests"
ON public.return_requests
FOR ALL
TO authenticated
USING (public.is_active_admin())
WITH CHECK (public.is_active_admin());

-- 3. return_items policies
CREATE POLICY "Customers can view their own return items"
ON public.return_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.return_requests r
    WHERE r.id = return_items.return_request_id
      AND (r.customer_id = auth.uid()::text OR r.customer_email = (auth.jwt() ->> 'email'))
  )
);

CREATE POLICY "Customers can insert items for their requests"
ON public.return_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.return_requests r
    WHERE r.id = return_items.return_request_id
      AND (r.customer_id = auth.uid()::text OR r.customer_email = (auth.jwt() ->> 'email'))
  )
);

CREATE POLICY "Admins have full access to return items"
ON public.return_items
FOR ALL
TO authenticated
USING (public.is_active_admin())
WITH CHECK (public.is_active_admin());

-- 4. uploaded_files policies
CREATE POLICY "Customers can view their own uploaded files"
ON public.uploaded_files
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.return_requests r
    WHERE r.id = uploaded_files.return_request_id
      AND (r.customer_id = auth.uid()::text OR r.customer_email = (auth.jwt() ->> 'email'))
  )
);

CREATE POLICY "Customers can attach files to their requests"
ON public.uploaded_files
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.return_requests r
    WHERE r.id = uploaded_files.return_request_id
      AND (r.customer_id = auth.uid()::text OR r.customer_email = (auth.jwt() ->> 'email'))
  )
);

CREATE POLICY "Admins have full access to uploaded files"
ON public.uploaded_files
FOR ALL
TO authenticated
USING (public.is_active_admin())
WITH CHECK (public.is_active_admin());

-- 5. shipments policies
CREATE POLICY "Customers can view shipments for their return requests"
ON public.shipments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.return_requests r
    WHERE r.id = shipments.return_request_id
      AND (r.customer_id = auth.uid()::text OR r.customer_email = (auth.jwt() ->> 'email'))
  )
);

CREATE POLICY "Admins have full access to shipments"
ON public.shipments
FOR ALL
TO authenticated
USING (public.is_active_admin())
WITH CHECK (public.is_active_admin());

-- 6. refunds policies
CREATE POLICY "Customers can view refunds for their return requests"
ON public.refunds
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.return_requests r
    WHERE r.id = refunds.return_request_id
      AND (r.customer_id = auth.uid()::text OR r.customer_email = (auth.jwt() ->> 'email'))
  )
);

CREATE POLICY "Admins have full access to refunds"
ON public.refunds
FOR ALL
TO authenticated
USING (public.is_active_admin())
WITH CHECK (public.is_active_admin());

-- 7. status_events policies
CREATE POLICY "Customers can view status events for their return requests"
ON public.status_events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.return_requests r
    WHERE r.id = status_events.return_request_id
      AND (r.customer_id = auth.uid()::text OR r.customer_email = (auth.jwt() ->> 'email'))
  )
);

CREATE POLICY "Admins have full access to status events"
ON public.status_events
FOR ALL
TO authenticated
USING (public.is_active_admin())
WITH CHECK (public.is_active_admin());

-- 8. policy_settings policies
CREATE POLICY "Public and customers can read policy settings"
ON public.policy_settings
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Admins can update policy settings"
ON public.policy_settings
FOR ALL
TO authenticated
USING (public.is_active_admin())
WITH CHECK (public.is_active_admin());

-- 9. webhook_events policies
CREATE POLICY "Admins can view webhook audit logs"
ON public.webhook_events
FOR SELECT
TO authenticated
USING (public.is_active_admin());
