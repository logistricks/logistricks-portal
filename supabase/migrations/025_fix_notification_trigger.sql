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

-- Also fix cargo_description → cargo_type (actual column name)
CREATE OR REPLACE FUNCTION public.notify_on_request_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.notifications (client_code, type, title, body, request_id)
  VALUES (
    NEW.client_code,
    'new_request',
    'New Request: ' || upper(substring(NEW.id::text, 1, 8)),
    COALESCE(
      NULLIF(trim(NEW.cargo_type), ''),
      'New freight request received'
    ),
    NEW.id
  );
  RETURN NEW;
END;
$$;

-- Richer notification body with sender + route info
CREATE OR REPLACE FUNCTION public.notify_on_request_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_title TEXT;
  v_body  TEXT;
BEGIN
  -- Title: sender name if available, else generic
  v_title := CASE
    WHEN NEW.sender_name IS NOT NULL AND trim(NEW.sender_name) <> ''
      THEN 'New Request from ' || trim(NEW.sender_name)
    WHEN NEW.sender_email IS NOT NULL AND trim(NEW.sender_email) <> ''
      THEN 'New Request from ' || trim(NEW.sender_email)
    ELSE 'New Freight Request'
  END;

  -- Body: route + cargo + sender email
  v_body := CONCAT_WS(E'\n',
    CASE
      WHEN NEW.origin_city IS NOT NULL AND NEW.destination_city IS NOT NULL
        THEN trim(NEW.origin_city) || ' → ' || trim(NEW.destination_city)
      ELSE NULL
    END,
    CASE
      WHEN NEW.cargo_type IS NOT NULL AND trim(NEW.cargo_type) <> ''
        THEN trim(NEW.cargo_type)
      ELSE NULL
    END,
    CASE
      WHEN NEW.sender_email IS NOT NULL AND trim(NEW.sender_email) <> ''
        THEN trim(NEW.sender_email)
      ELSE NULL
    END
  );

  INSERT INTO public.notifications (client_code, type, title, body, request_id)
  VALUES (NEW.client_code, 'new_request', v_title, v_body, NEW.id);

  RETURN NEW;
END;
$$;
