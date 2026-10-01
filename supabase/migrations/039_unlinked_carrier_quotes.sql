-- ============================================================
-- 039_unlinked_carrier_quotes.sql
--
-- Carrier replies the system cannot match to a freight request are now
-- stored as "non-linked" quotes (shown on the Non-linked Quotes page)
-- instead of being dropped.
--
--   * carrier_quotes gets client_code, so a quote belongs to a client
--     even before it belongs to a request.
--   * carrier_quote_request_id / freight_request_id / carrier_id become
--     nullable. A quote with no freight_request_id is "non-linked".
--   * linked_by_ai: true  = matched automatically by the system/AI
--                   false = linked by a user
--                   null  = not linked
--   * email metadata (sender, subject, thread/message ids) so the user
--     can see which email a non-linked quote came from.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

BEGIN;

-- ── 1. Quote belongs to a client ───────────────────────────────────────────
ALTER TABLE public.carrier_quotes ADD COLUMN IF NOT EXISTS client_code CITEXT;

UPDATE public.carrier_quotes q
   SET client_code = f.client_code::citext
  FROM public.freight_requests f
 WHERE q.freight_request_id = f.id
   AND q.client_code IS NULL;

ALTER TABLE public.carrier_quotes ALTER COLUMN client_code SET NOT NULL;

-- ── 2. A quote may exist without a request / RFQ / known carrier ───────────
ALTER TABLE public.carrier_quotes
  ALTER COLUMN carrier_quote_request_id DROP NOT NULL,
  ALTER COLUMN freight_request_id       DROP NOT NULL,
  ALTER COLUMN carrier_id               DROP NOT NULL;

-- ── 3. Link state + source email ───────────────────────────────────────────
ALTER TABLE public.carrier_quotes
  ADD COLUMN IF NOT EXISTS from_email       TEXT,
  ADD COLUMN IF NOT EXISTS email_subject    TEXT,
  ADD COLUMN IF NOT EXISTS email_thread_id  TEXT,
  ADD COLUMN IF NOT EXISTS email_message_id TEXT,
  ADD COLUMN IF NOT EXISTS linked_by_ai     BOOLEAN,
  ADD COLUMN IF NOT EXISTS link_method      TEXT,
  ADD COLUMN IF NOT EXISTS linked_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS linked_by        TEXT,
  ADD COLUMN IF NOT EXISTS unlinked_reason  TEXT;

-- Quotes that already exist were linked automatically by the intake workflow.
UPDATE public.carrier_quotes
   SET linked_by_ai = true,
       linked_at    = COALESCE(linked_at, received_at)
 WHERE freight_request_id IS NOT NULL
   AND linked_by_ai IS NULL;

-- ── 4. Keep the link state consistent ──────────────────────────────────────
-- Either fully unlinked (no request, no RFQ, no flag) or fully linked
-- (request + RFQ + a yes/no flag). Nothing in between.
ALTER TABLE public.carrier_quotes DROP CONSTRAINT IF EXISTS carrier_quotes_link_consistent;
ALTER TABLE public.carrier_quotes ADD CONSTRAINT carrier_quotes_link_consistent CHECK (
  (freight_request_id IS NULL     AND carrier_quote_request_id IS NULL     AND linked_by_ai IS NULL)
  OR
  (freight_request_id IS NOT NULL AND carrier_quote_request_id IS NOT NULL AND linked_by_ai IS NOT NULL)
);

ALTER TABLE public.carrier_quotes DROP CONSTRAINT IF EXISTS carrier_quotes_link_method_check;
ALTER TABLE public.carrier_quotes ADD CONSTRAINT carrier_quotes_link_method_check CHECK (
  link_method IS NULL
  OR link_method IN ('rfq_reference', 'request_and_carrier', 'email_thread', 'manual')
);

-- ── 5. Indexes ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS cq_client_idx
  ON public.carrier_quotes (client_code);

CREATE INDEX IF NOT EXISTS cq_client_unlinked_idx
  ON public.carrier_quotes (client_code, received_at DESC)
  WHERE freight_request_id IS NULL;

COMMENT ON COLUMN public.carrier_quotes.linked_by_ai IS
  'true = matched automatically, false = linked by a user, null = not linked to a request.';
COMMENT ON COLUMN public.carrier_quotes.link_method IS
  'How it was linked: rfq_reference | request_and_carrier | email_thread | manual.';
COMMENT ON COLUMN public.carrier_quotes.unlinked_reason IS
  'Why it is not linked: carrier_not_recognised | no_reference_found | no_matching_rfq | unlinked_manually.';

COMMIT;
