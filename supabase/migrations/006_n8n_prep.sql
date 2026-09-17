-- ============================================================
-- 006_n8n_prep.sql
-- webhook_log table + notes on n8n credentials.
-- Run AFTER 003_data_tables.sql.
-- ============================================================

CREATE TYPE IF NOT EXISTS webhook_status AS ENUM (
  'received', 'processing', 'processed', 'error'
);

-- Logs every inbound webhook call from n8n
CREATE TABLE IF NOT EXISTS webhook_log (
  id                   BIGSERIAL       PRIMARY KEY,
  client_code          VARCHAR(15)     REFERENCES clients(client_code),
  source               VARCHAR(50)     NOT NULL,   -- e.g. 'n8n-email-parser', 'n8n-whatsapp'
  payload              JSONB           NOT NULL DEFAULT '{}',
  status               webhook_status  NOT NULL DEFAULT 'received',
  error_details        TEXT,
  processed_request_id UUID            REFERENCES freight_requests(id) ON DELETE SET NULL,
  received_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
  processed_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS whl_client_idx     ON webhook_log(client_code);
CREATE INDEX IF NOT EXISTS whl_received_idx   ON webhook_log(received_at DESC);
CREATE INDEX IF NOT EXISTS whl_status_idx     ON webhook_log(status);

-- Only service_role can write to webhook_log (n8n uses service_role key)
-- Authenticated users can read (admins for their client)
ALTER TABLE webhook_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_log_admin_select"
  ON webhook_log FOR SELECT
  USING (client_code = get_my_client_code() AND i_am_admin());

-- ============================================================
-- n8n SETUP CHECKLIST (non-SQL steps — follow in n8n UI)
-- ============================================================
--
-- 1. CREDENTIALS TO CREATE IN N8N
-- ────────────────────────────────
-- a) "Supabase (Service Role)" — HTTP Header Auth credential
--    Header Name:   apikey
--    Header Value:  <your service_role key>
--    Also set:      Authorization: Bearer <service_role key>
--    Base URL hint: https://<project-ref>.supabase.co/rest/v1/
--
-- b) "Supabase Postgres" — Postgres credential
--    Host:     db.<project-ref>.supabase.co
--    Port:     5432
--    Database: postgres
--    User:     postgres
--    Password: <your db password>
--    SSL:      require
--
-- c) "Gmail" or "IMAP" — for email trigger workflow
-- d) Optional: "OpenAI" or "Anthropic" — for AI parsing node
--
-- 2. ENVIRONMENT VARIABLES (add to .env.local)
-- ─────────────────────────────────────────────
-- N8N_WEBHOOK_URL=https://n8n.yourdomain.com/webhook/<id>
-- SUPABASE_SERVICE_ROLE_KEY=<your service_role key>   # server-side only, never expose
--
-- 3. N8N WORKFLOW: EMAIL → FREIGHT REQUEST
-- ─────────────────────────────────────────
-- [Gmail Trigger] → [AI Parse Node] → [Code Node: map fields] →
-- [Supabase: INSERT webhook_log] →
-- [Supabase: INSERT freight_requests] →
-- [Supabase: UPDATE webhook_log SET status=processed]
--
-- 4. N8N WORKFLOW: WHATSAPP → FREIGHT REQUEST
-- ─────────────────────────────────────────────
-- [Webhook Trigger] → [AI Parse Node] → [Code Node: map fields] →
-- [Supabase: INSERT freight_requests with source='WhatsApp']
--
-- 5. SECURING N8N WEBHOOKS
-- ─────────────────────────
-- Add a secret header to n8n webhook trigger:
--   X-Webhook-Secret: <random string>
-- Verify in the workflow's first node before processing.
--
-- ============================================================

-- Verify setup by checking tables exist:
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'clients', 'profiles', 'carriers',
    'message_templates', 'freight_requests',
    'outreach_log', 'login_log',
    'user_action_log', 'webhook_log'
  )
ORDER BY table_name;
