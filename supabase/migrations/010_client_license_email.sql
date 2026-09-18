-- ============================================================
-- 010_client_license_email.sql
-- Adds receiver_email + license gating to the clients table.
-- Run in Supabase SQL Editor.
-- ============================================================

-- 1. Add columns
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS receiver_email   TEXT    UNIQUE,
  ADD COLUMN IF NOT EXISTS license_active   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS license_expires  DATE;

-- 2. Comment for clarity
COMMENT ON COLUMN clients.receiver_email  IS 'Inbound email address n8n monitors for this client';
COMMENT ON COLUMN clients.license_active  IS 'Only clients with license_active = true will have freight emails processed by n8n';
COMMENT ON COLUMN clients.license_expires IS 'Optional hard expiry date; NULL = perpetual';

-- 3. Seed values for existing clients
UPDATE clients
SET receiver_email  = 'demox@intake.logistricks.com',
    license_active  = true,
    license_expires = NULL
WHERE client_code = 'DEMOX';

UPDATE clients
SET receiver_email  = 'demo@intake.logistricks.com',
    license_active  = true,
    license_expires = NULL
WHERE client_code = 'DEMO';

-- 4. Helper view — what n8n will query
--    Returns one row only if the To-address belongs to an active licensed client.
CREATE OR REPLACE VIEW active_client_by_email AS
SELECT
  client_code,
  company_name,
  receiver_email,
  license_active,
  license_expires
FROM clients
WHERE license_active = true
  AND (license_expires IS NULL OR license_expires >= CURRENT_DATE);

-- Grant anon SELECT on the view so n8n's anon key can query it
GRANT SELECT ON active_client_by_email TO anon;

-- 5. Verify
SELECT client_code, company_name, receiver_email, license_active, license_expires
FROM clients
ORDER BY client_code;
