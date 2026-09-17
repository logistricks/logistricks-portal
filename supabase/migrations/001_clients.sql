-- ============================================================
-- 001_clients.sql
-- Master client registry — run this first, everything else
-- depends on the client_code FK.
-- ============================================================

CREATE TABLE IF NOT EXISTS clients (
  client_code   VARCHAR(15)  PRIMARY KEY,
  company_name  VARCHAR(100) NOT NULL,
  trading_name  VARCHAR(100),
  industry      VARCHAR(50),
  contact_name  VARCHAR(100),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(30),
  country       VARCHAR(50),
  standard_package BOOLEAN NOT NULL DEFAULT true,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Keep updated_at current automatically
CREATE OR REPLACE FUNCTION _set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

-- RLS
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- Users may only read their own client row
-- (service_role key always bypasses RLS)
CREATE POLICY "clients_select_own"
  ON clients FOR SELECT
  USING (client_code = (
    SELECT p.client_code FROM profiles p WHERE p.id = auth.uid() LIMIT 1
  ));

-- Only admins (via service_role) insert/update clients
-- Regular users cannot mutate this table directly

-- ── Seed ──────────────────────────────────────────────────
INSERT INTO clients (client_code, company_name, contact_name, contact_email, country, notes)
VALUES (
  'DEMO',
  'Logistricks Demo',
  'Abdulaziz',
  'abd.khayyat@gmail.com',
  'Jordan',
  'Internal demo / test client — all sandbox data lives here'
)
ON CONFLICT (client_code) DO NOTHING;
