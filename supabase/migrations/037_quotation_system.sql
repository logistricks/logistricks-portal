-- ============================================================
-- 037_quotation_system.sql
-- Auto-send RFQ flag, carrier-reply reference matching, and the
-- new Quotation Templates + Quotations system.
-- ============================================================

-- ── 1. Per-carrier auto-send flag ────────────────────────────
ALTER TABLE public.carriers
  ADD COLUMN IF NOT EXISTS auto_send_rfq BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.carriers.auto_send_rfq IS
  'When true, this carrier is included in the automated RFQ send (n8n) whenever a new complete request matches its modes/routes.';

-- ── 2. RFQ reference token on carrier_quote_requests ─────────
-- Short human-matchable code embedded in the outgoing RFQ email
-- (subject/body) so a carrier's reply — whether sent via n8n's
-- Gmail send or the portal's manual mailto flow — can be matched
-- back to the right row even without a real Gmail threadId.
ALTER TABLE public.carrier_quote_requests
  ADD COLUMN IF NOT EXISTS rfq_reference TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS cqr_rfq_reference_idx
  ON public.carrier_quote_requests (rfq_reference)
  WHERE rfq_reference IS NOT NULL;

-- ── 3. quotation_templates ───────────────────────────────────
-- Form templates for the OUTBOUND company quotation sent back to
-- the original requester (distinct from `templates`, which are
-- the carrier-facing RFQ / auto-reply templates).
CREATE TABLE IF NOT EXISTS public.quotation_templates (
  id             BIGSERIAL    PRIMARY KEY,
  client_code    citext       NOT NULL REFERENCES public.clients(client_code) ON DELETE CASCADE ON UPDATE CASCADE,
  template_id    INTEGER      NOT NULL,     -- logical serial per client_code
  template_name  TEXT         NOT NULL DEFAULT '',
  subject        TEXT         NOT NULL DEFAULT '',
  body           TEXT         NOT NULL DEFAULT '',
  is_default     BOOLEAN      NOT NULL DEFAULT false,
  active         BOOLEAN      NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (client_code, template_id)
);

CREATE INDEX IF NOT EXISTS quotation_templates_client_code_idx
  ON public.quotation_templates (client_code);

COMMENT ON TABLE public.quotation_templates IS
  'Form templates used to auto-build the outbound quotation sent to the original requester. Placeholders use {{token}} syntax, same convention as `templates`.';

-- ── 4. quotations ─────────────────────────────────────────────
-- One row per generated quotation document: carrier quote +
-- markup -> final price -> rendered doc -> (optionally) sent.
CREATE TABLE IF NOT EXISTS public.quotations (
  id                    BIGSERIAL    PRIMARY KEY,
  client_code           citext       NOT NULL REFERENCES public.clients(client_code) ON DELETE CASCADE ON UPDATE CASCADE,
  freight_request_id    UUID         NOT NULL REFERENCES freight_requests(id) ON DELETE CASCADE,
  carrier_quote_id      BIGINT       REFERENCES carrier_quotes(id) ON DELETE SET NULL,
  quotation_template_id INTEGER      NOT NULL,   -- references quotation_templates.template_id (per client_code)

  base_rate_usd         NUMERIC(12, 2),          -- carrier's rate at time of creation
  markup_type           TEXT         NOT NULL DEFAULT 'flat' CHECK (markup_type IN ('flat', 'percent')),
  markup_amount         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  final_price_usd        NUMERIC(12, 2),

  generated_subject     TEXT,
  generated_body        TEXT,

  status                TEXT         NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent')),
  sent_at               TIMESTAMPTZ,

  created_by            TEXT,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS quotations_freight_request_idx ON public.quotations (freight_request_id);
CREATE INDEX IF NOT EXISTS quotations_client_code_idx      ON public.quotations (client_code);

DROP TRIGGER IF EXISTS quotations_updated_at ON public.quotations;
CREATE TRIGGER quotations_updated_at
  BEFORE UPDATE ON public.quotations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 5. Realtime for quotations (so the builder UI can live-update) ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'quotations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE quotations;
  END IF;
END $$;
