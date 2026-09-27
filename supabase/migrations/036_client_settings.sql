-- ============================================================
-- 036_client_settings.sql
-- Per-client key/value settings store (theme colors etc.)
-- ============================================================

CREATE TABLE IF NOT EXISTS client_settings (
  client_code  VARCHAR(15)  NOT NULL REFERENCES clients(client_code) ON DELETE CASCADE,
  key          TEXT         NOT NULL,
  value        JSONB        NOT NULL DEFAULT '{}',
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (client_code, key)
);

ALTER TABLE client_settings ENABLE ROW LEVEL SECURITY;

-- Service role (used by our API routes) can do everything
-- Regular auth users cannot access this directly
CREATE POLICY "service_role_only"
  ON client_settings
  USING (false)
  WITH CHECK (false);

-- Index for fast client lookups
CREATE INDEX IF NOT EXISTS client_settings_client_code_idx ON client_settings (client_code);

COMMENT ON TABLE client_settings IS
  'Per-client configuration blobs. key = setting name (e.g. "theme"), value = JSONB payload.';
