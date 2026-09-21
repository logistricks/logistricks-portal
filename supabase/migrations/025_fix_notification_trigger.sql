-- Migration 025: fix notifications trigger and FK (request_id → id)
-- The freight_requests PK is `id`, not `request_id`

-- Fix the FK on notifications table
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_request_id_fkey;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_request_id_fkey
  FOREIGN KEY (request_id) REFERENCES public.freight_requests(id) ON DELETE SET NULL;

-- Fix the trigger function to use NEW.id instead of NEW.request_id
CREATE OR REPLACE FUNCTION public.notify_on_request_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.notifications (client_code, type, title, body, request_id)
  VALUES (
    NEW.client_code,
    'new_request',
    'New Request: ' || upper(substring(NEW.id::text, 1, 8)),
    COALESCE(
      NULLIF(trim(NEW.cargo_description), ''),
      'New freight request received'
    ),
    NEW.id
  );
  RETURN NEW;
END;
$$;
