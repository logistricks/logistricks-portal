-- ============================================================
-- 038_request_serial_and_unique_mailboxes.sql
--
-- 1. Per-client serial number for every freight request
--      request_number  1, 2, 3 ... (restarts at 1 for each client)
--      request_ref     LT-0001 ...  (generated, display form)
--    The number is only unique together with client_code. A request is
--    identified by (client, number); the client is resolved from the
--    mailbox the email travelled through (see part 2).
--
-- 2. A client mailbox address can belong to ONE client only.
--    Covers client_receiver_emails.r_mail and the connected mailboxes in
--    email_sources (ms_email, and imap_username when it is an address).
--    Comparison is case-insensitive and ignores surrounding spaces.
--    Carrier addresses are NOT covered: two clients may use the same carrier.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- If part 2 finds addresses that are already shared, the script stops
-- before changing anything and lists them.
-- ============================================================

BEGIN;

-- ── 0. Pre-flight: refuse to continue if mailboxes are already shared ──────
DO $$
DECLARE
  conflicts TEXT;
BEGIN
  WITH m AS (
    SELECT lower(btrim(r_mail)) AS addr, lower(client_code::text) AS cc, 'receiver'::text AS src
      FROM public.client_receiver_emails
    UNION ALL
    SELECT lower(btrim(ms_email)), lower(client_code::text), 'source'
      FROM public.email_sources
     WHERE position('@' in coalesce(ms_email, '')) > 0
    UNION ALL
    SELECT lower(btrim(imap_username)), lower(client_code::text), 'source'
      FROM public.email_sources
     WHERE position('@' in coalesce(imap_username, '')) > 0
  ), bad AS (
    SELECT addr, string_agg(DISTINCT cc, ', ') AS clients
      FROM m
     GROUP BY addr
    HAVING count(DISTINCT cc) > 1
        OR count(*) FILTER (WHERE src = 'receiver') > 1
  )
  SELECT string_agg(addr || ' (' || clients || ')', '; ')
    INTO conflicts
    FROM bad;

  IF conflicts IS NOT NULL THEN
    RAISE EXCEPTION
      'Mailbox addresses are shared between clients (or listed twice). Remove the duplicates, then re-run: %',
      conflicts;
  END IF;
END $$;

-- ── 1. Serial number per client ────────────────────────────────────────────

-- One counter row per client. Numbers are never reused, even after a delete.
CREATE TABLE IF NOT EXISTS public.client_request_counters (
  client_code  CITEXT   PRIMARY KEY,
  last_number  INTEGER  NOT NULL DEFAULT 0
);
ALTER TABLE public.client_request_counters ENABLE ROW LEVEL SECURITY;  -- no policies: written only by the trigger

ALTER TABLE public.freight_requests
  ADD COLUMN IF NOT EXISTS request_number INTEGER;

-- Backfill existing requests oldest-first. User triggers are switched off so
-- the audit log is not flooded and updated_at is not bumped on every row.
ALTER TABLE public.freight_requests DISABLE TRIGGER USER;

WITH base AS (
  SELECT client_code::citext AS cc, COALESCE(MAX(request_number), 0) AS mx
    FROM public.freight_requests
   GROUP BY 1
), ranked AS (
  SELECT f.id,
         b.mx + row_number() OVER (
           PARTITION BY f.client_code::citext
           ORDER BY f.received_at, f.created_at, f.id
         ) AS rn
    FROM public.freight_requests f
    JOIN base b ON b.cc = f.client_code::citext
   WHERE f.request_number IS NULL
)
UPDATE public.freight_requests f
   SET request_number = r.rn
  FROM ranked r
 WHERE f.id = r.id;

ALTER TABLE public.freight_requests ENABLE TRIGGER USER;

-- Start each client's counter after its highest existing number.
INSERT INTO public.client_request_counters (client_code, last_number)
SELECT client_code::citext, MAX(request_number)
  FROM public.freight_requests
 GROUP BY 1
ON CONFLICT (client_code) DO UPDATE
  SET last_number = GREATEST(public.client_request_counters.last_number, EXCLUDED.last_number);

ALTER TABLE public.freight_requests
  ALTER COLUMN request_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS freight_requests_client_request_number_key
  ON public.freight_requests (client_code, request_number);

-- Display form, e.g. LT-0042. Four digits minimum, grows past 9999 (lpad would truncate).
ALTER TABLE public.freight_requests
  ADD COLUMN IF NOT EXISTS request_ref TEXT
  GENERATED ALWAYS AS (
    'LT-' || lpad(request_number::text, greatest(4, length(request_number::text)), '0')
  ) STORED;

-- Assign the next number on every insert (portal, n8n, anything else).
-- The counter upsert locks the client's row, so concurrent inserts cannot collide.
CREATE OR REPLACE FUNCTION public.assign_request_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.client_request_counters AS c (client_code, last_number)
  VALUES (NEW.client_code::citext, 1)
  ON CONFLICT (client_code) DO UPDATE SET last_number = c.last_number + 1
  RETURNING c.last_number INTO NEW.request_number;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS freight_requests_assign_request_number ON public.freight_requests;
CREATE TRIGGER freight_requests_assign_request_number
  BEFORE INSERT ON public.freight_requests
  FOR EACH ROW EXECUTE FUNCTION public.assign_request_number();

-- A number, once issued, never changes (it is printed on emails).
CREATE OR REPLACE FUNCTION public.protect_request_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.request_number IS DISTINCT FROM OLD.request_number THEN
    RAISE EXCEPTION 'request_number cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS freight_requests_protect_request_number ON public.freight_requests;
CREATE TRIGGER freight_requests_protect_request_number
  BEFORE UPDATE OF request_number ON public.freight_requests
  FOR EACH ROW EXECUTE FUNCTION public.protect_request_number();

COMMENT ON COLUMN public.freight_requests.request_number IS
  'Serial per client_code, assigned by trigger. Only unique together with client_code.';
COMMENT ON COLUMN public.freight_requests.request_ref IS
  'Display reference, e.g. LT-0042. Generated from request_number.';

-- ── 2. A mailbox belongs to one client only ────────────────────────────────

-- Case-insensitive uniqueness inside client_receiver_emails (the original
-- constraint is case-sensitive, so Ops@x.com and ops@x.com could coexist).
CREATE UNIQUE INDEX IF NOT EXISTS client_receiver_emails_r_mail_ci_key
  ON public.client_receiver_emails (lower(btrim(r_mail)));

-- Cross-table, cross-client check. SECURITY DEFINER so it can see other
-- clients' rows; direct calls are revoked so it cannot be used to probe.
CREATE OR REPLACE FUNCTION public.assert_mailbox_free(p_addr TEXT, p_client TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a TEXT := lower(btrim(coalesce(p_addr, '')));
BEGIN
  IF a = '' OR position('@' in a) = 0 THEN
    RETURN;
  END IF;

  -- Serialise concurrent registrations of the same address.
  PERFORM pg_advisory_xact_lock(hashtext('mailbox:' || a));

  IF EXISTS (
       SELECT 1 FROM public.client_receiver_emails
        WHERE lower(btrim(r_mail)) = a
          AND lower(client_code::text) <> lower(p_client)
     )
  OR EXISTS (
       SELECT 1 FROM public.email_sources
        WHERE lower(client_code::text) <> lower(p_client)
          AND (lower(btrim(coalesce(ms_email, '')))     = a
            OR lower(btrim(coalesce(imap_username, ''))) = a)
     )
  THEN
    RAISE EXCEPTION 'This email address is already registered to another client.'
      USING ERRCODE = '23505', HINT = 'mailbox_already_registered';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assert_mailbox_free(TEXT, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_receiver_email_unique()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_mailbox_free(NEW.r_mail, NEW.client_code::text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS client_receiver_emails_unique_mailbox ON public.client_receiver_emails;
CREATE TRIGGER client_receiver_emails_unique_mailbox
  BEFORE INSERT OR UPDATE OF r_mail, client_code ON public.client_receiver_emails
  FOR EACH ROW EXECUTE FUNCTION public.trg_receiver_email_unique();

CREATE OR REPLACE FUNCTION public.trg_email_source_unique()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_mailbox_free(NEW.ms_email,       NEW.client_code::text);
  PERFORM public.assert_mailbox_free(NEW.imap_username,  NEW.client_code::text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS email_sources_unique_mailbox ON public.email_sources;
CREATE TRIGGER email_sources_unique_mailbox
  BEFORE INSERT OR UPDATE OF ms_email, imap_username, client_code ON public.email_sources
  FOR EACH ROW EXECUTE FUNCTION public.trg_email_source_unique();

COMMIT;

-- Check: every client starts at LT-0001 and counts up with no gaps or repeats.
-- SELECT client_code, count(*) AS requests, min(request_ref) AS first, max(request_ref) AS last
--   FROM public.freight_requests GROUP BY client_code ORDER BY client_code;
