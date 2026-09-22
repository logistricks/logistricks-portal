-- Migration 028: auto_reply_logs table
-- Tracks every auto-reply email rendered and returned by /api/auto-reply.

CREATE TABLE IF NOT EXISTS public.auto_reply_logs (
  id           BIGSERIAL PRIMARY KEY,
  client_code  TEXT        NOT NULL,
  log_type     TEXT        NOT NULL CHECK (log_type IN ('acknowledgement', 'missing_fields', 'carrier')),
  sender_email TEXT        NOT NULL,
  sender_name  TEXT,
  subject      TEXT,
  request_id   TEXT,
  meta         JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.auto_reply_logs IS 'Log of every auto-reply email rendered by the portal.';
COMMENT ON COLUMN public.auto_reply_logs.log_type IS
  'acknowledgement = standard ack, missing_fields = sent when critical fields are absent, carrier = sent to a carrier.';

CREATE INDEX IF NOT EXISTS auto_reply_logs_client_code_idx ON public.auto_reply_logs (client_code, created_at DESC);
CREATE INDEX IF NOT EXISTS auto_reply_logs_request_id_idx  ON public.auto_reply_logs (request_id) WHERE request_id IS NOT NULL;
