-- ============================================================
-- 009_add_demox_client.sql
-- Create DEMOX client, migrate abdulaziz + all existing data
-- to it, leaving DEMO clean for the demo user.
-- Run in Supabase SQL Editor.
-- ============================================================

-- 1. Create DEMOX client
INSERT INTO clients (client_code, company_name, contact_name, notes)
VALUES (
  'DEMOX',
  'Orbit Freight Forwarding',
  'Abdulaziz',
  'Primary environment — existing test data lives here'
)
ON CONFLICT (client_code) DO NOTHING;

-- 2. Move all freight_requests from DEMO → DEMOX
UPDATE freight_requests
SET client_code = 'DEMOX'
WHERE client_code = 'DEMO';

-- 3. Move abdulaziz's profile to DEMOX
UPDATE profiles
SET client_code = 'DEMOX'
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'abd.khayyat@gmail.com'
);

-- 4. Move abdulaziz's portal_users entry to DEMOX
UPDATE portal_users
SET client_code = 'DEMOX'
WHERE username = 'abdulaziz' AND client_code = 'DEMO';

-- 5. If there's a carriers table with client_code, move those too
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'carriers'
      AND column_name  = 'client_code'
  ) THEN
    UPDATE carriers SET client_code = 'DEMOX' WHERE client_code = 'DEMO';
  END IF;
END $$;

-- 6. Verify
SELECT 'freight_requests' AS tbl, client_code, count(*)::int AS rows
FROM freight_requests GROUP BY client_code
UNION ALL
SELECT 'profiles', client_code, count(*)::int
FROM profiles GROUP BY client_code
UNION ALL
SELECT 'portal_users', client_code, count(*)::int
FROM portal_users GROUP BY client_code
ORDER BY tbl, client_code;
