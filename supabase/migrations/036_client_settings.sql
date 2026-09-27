-- ============================================================
-- 036_client_settings.sql
-- Per-client key/value settings store (theme colors etc.)
-- client_code matches clients.client_code which is citext in prod
-- ============================================================

CREATE TABLE IF NOT EXISTS client_settings (
  client_code  citext       NOT NULL REFERENCES clients(client_code) ON DELETE CASCADE ON UPDATE CASCADE,
  key          TEXT         NOT NULL,
  value        JSONB        NOT NULL DEFAULT '{}',
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (client_code, key)
);

ALTER TABLE client_settings ENABLE ROW LEVEL SECURITY;

-- All access goes through service_role via our API routes
CREATE POLICY "service_role_only"
  ON client_settings
  USING (false)
  WITH CHECK (false);

CREATE INDEX IF NOT EXISTS client_settings_client_code_idx ON client_settings (client_code);

COMMENT ON TABLE client_settings IS
  'Per-client configuration blobs. key = setting name (e.g. "theme"), value = JSONB payload.';
