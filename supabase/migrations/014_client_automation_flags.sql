-- ============================================================
-- 014_client_automation_flags.sql
-- Adds automation control columns to clients and cc_emails to carriers
-- ============================================================

-- ── Client automation flags ──────────────────────────────────
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS allow_auto_send_to_carrier BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_critical_data      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS critical_fields            TEXT[]  NOT NULL DEFAULT '{}';

COMMENT ON COLUMN clients.allow_auto_send_to_carrier IS
  'When true, the system may automatically send the carrier email without manual confirmation.';
COMMENT ON COLUMN clients.require_critical_data IS
  'When true, "Send to Carrier" is disabled if any critical_fields are missing from the request.';
COMMENT ON COLUMN clients.critical_fields IS
  'Array of field keys (cargo_type, weight, dimensions, equipment, incoterm, bl_type) that are mandatory before sending to carrier.';

-- ── CC emails on carriers ────────────────────────────────────
ALTER TABLE carriers
  ADD COLUMN IF NOT EXISTS cc_emails TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN carriers.cc_emails IS
  'Additional email addresses to CC when sending rate requests to this carrier.';
