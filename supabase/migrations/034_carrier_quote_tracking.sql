-- ============================================================
-- 034_carrier_quote_tracking.sql
-- Full carrier-side quote tracking system
-- Run in Supabase SQL Editor
-- ============================================================

-- ── 1. carrier_quote_requests — one row per RFQ sent ────────
-- Links a freight request to a carrier outreach via email thread.
-- carrier_id is BIGINT to match the existing carriers table (serial/bigint PK).

CREATE TABLE IF NOT EXISTS carrier_quote_requests (
  id                 BIGSERIAL PRIMARY KEY,
  freight_request_id UUID        NOT NULL REFERENCES freight_requests(id) ON DELETE CASCADE,
  carrier_id         BIGINT      NOT NULL REFERENCES carriers(id),
  email_thread_id    TEXT        NOT NULL,           -- Gmail threadId for reply matching
  email_message_id   TEXT,                           -- Gmail message id of the sent RFQ
  status             TEXT        NOT NULL DEFAULT 'sent'
                     CHECK (status IN ('sent', 'responded', 'expired', 'declined')),
  sent_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cqr_freight_request_idx ON carrier_quote_requests(freight_request_id);
CREATE INDEX IF NOT EXISTS cqr_thread_id_idx       ON carrier_quote_requests(email_thread_id);
CREATE INDEX IF NOT EXISTS cqr_carrier_idx         ON carrier_quote_requests(carrier_id);

-- ── 2. carrier_quotes — parsed rate from a carrier reply ─────
CREATE TABLE IF NOT EXISTS carrier_quotes (
  id                      BIGSERIAL PRIMARY KEY,
  carrier_quote_request_id BIGINT    NOT NULL REFERENCES carrier_quote_requests(id) ON DELETE CASCADE,
  freight_request_id      UUID       NOT NULL REFERENCES freight_requests(id) ON DELETE CASCADE,
  carrier_id              BIGINT     NOT NULL REFERENCES carriers(id),

  -- Parsed by AI from carrier reply email
  rate_usd                NUMERIC(12, 2),            -- all-in USD rate
  rate_currency           TEXT       DEFAULT 'USD',  -- original currency
  rate_original           NUMERIC(12, 2),            -- rate in original currency
  transit_days            SMALLINT,
  validity_date           DATE,                      -- quote valid until
  free_days               SMALLINT,                  -- free days at destination
  notes                   TEXT,                      -- extra terms / remarks
  raw_reply               TEXT,                      -- full carrier reply text

  received_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cq_freight_request_idx ON carrier_quotes(freight_request_id);
CREATE INDEX IF NOT EXISTS cq_carrier_idx         ON carrier_quotes(carrier_id);

-- ── 3. known_decorative_images ───────────────────────────────
-- Used by the n8n "Filter & Store Attachments" node for fingerprinting.
CREATE TABLE IF NOT EXISTS known_decorative_images (
  content_hash    TEXT        PRIMARY KEY,
  sample_filename TEXT,
  seen_count      INT         NOT NULL DEFAULT 1,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. Auto-update updated_at on carrier_quote_requests ─────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS cqr_updated_at ON carrier_quote_requests;
CREATE TRIGGER cqr_updated_at
  BEFORE UPDATE ON carrier_quote_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 5. Enable Realtime on new tables ─────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'carrier_quote_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE carrier_quote_requests;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'carrier_quotes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE carrier_quotes;
  END IF;
END $$;
