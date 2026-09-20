-- Migration 022: notification inbox + push subscriptions
-- Run in Supabase SQL editor

-- ─── Notifications ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_code  TEXT        NOT NULL REFERENCES public.clients(client_code) ON DELETE CASCADE,
  type         TEXT        NOT NULL DEFAULT 'new_request',
  title        TEXT        NOT NULL,
  body         TEXT,
  request_id   UUID        REFERENCES public.freight_requests(request_id) ON DELETE SET NULL,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_client_created
  ON public.notifications(client_code, created_at DESC);

-- ─── DB trigger: auto-create notification on new freight_request ─────────────
CREATE OR REPLACE FUNCTION public.notify_on_request_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.notifications (client_code, type, title, body, request_id)
  VALUES (
    NEW.client_code,
    'new_request',
    'New Request: ' || upper(substring(NEW.request_id::text, 1, 8)),
    COALESCE(
      NULLIF(trim(NEW.cargo_description), ''),
      'New freight request received'
    ),
    NEW.request_id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_on_request_insert ON public.freight_requests;
CREATE TRIGGER trigger_notify_on_request_insert
  AFTER INSERT ON public.freight_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_request_insert();

-- ─── Push subscriptions (Web Push / VAPID) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_code  TEXT        NOT NULL REFERENCES public.clients(client_code) ON DELETE CASCADE,
  endpoint     TEXT        NOT NULL UNIQUE,
  p256dh       TEXT        NOT NULL,
  auth         TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_client
  ON public.push_subscriptions(client_code);
