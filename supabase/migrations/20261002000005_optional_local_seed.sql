-- ==============================================================================
-- ETHNOIR Return & Replacement Application
-- Migration 05: Optional Local-Development Seed Migration (DISABLED BY DEFAULT)
-- Brand: ETHNOIR (ethnoirindia.myshopify.com)
-- 
-- CAUTION:
-- This seed file must NEVER insert sample orders or mock Shiprocket records into
-- production. It only executes if the safety parameter 'ENABLE_LOCAL_DEV_SEED' is
-- explicitly set to 'TRUE' in a local non-production environment.
-- ==============================================================================

DO $$
BEGIN
  -- Strict guard check: do not execute in production
  IF current_setting('app.enable_local_dev_seed', true) = 'TRUE' THEN
    RAISE NOTICE 'Local dev seed explicitly enabled. Inserting local development mock fixtures...';
    
    -- Insert default policy settings if not present
    INSERT INTO public.policy_settings (
      return_window_days,
      replacement_enabled,
      exchange_enabled,
      refund_enabled,
      non_returnable_tags,
      updated_by
    ) VALUES (
      14,
      true,
      true,
      true,
      '["final-sale", "innerwear", "customized"]'::jsonb,
      NULL
    ) ON CONFLICT DO NOTHING;

  ELSE
    -- Production safety: default policy initialization only (NO mock orders, NO mock shipments)
    INSERT INTO public.policy_settings (
      return_window_days,
      replacement_enabled,
      exchange_enabled,
      refund_enabled,
      non_returnable_tags,
      updated_by
    ) VALUES (
      14,
      true,
      true,
      true,
      '[]'::jsonb,
      NULL
    ) ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Production safety active: Mock orders, fake AWBs and demo records were NOT inserted.';
  END IF;
END $$;
