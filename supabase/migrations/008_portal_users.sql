-- ============================================================
-- 008_portal_users.sql
-- Introduces portal_users table for username + client_code
-- login. Also adds a second demo client (DEMO2).
-- Run in Supabase SQL Editor.
-- ============================================================

-- ── New demo client ──────────────────────────────────────────
INSERT INTO clients (client_code, company_name, contact_name, notes)
VALUES (
  'DEMO2',
  'Logistricks Demo Showcase',
  'Demo User',
  'Clean demo environment — build showcase data here'
)
ON CONFLICT (client_code) DO NOTHING;

-- ── portal_users ─────────────────────────────────────────────
-- Maps (username, client_code) → auth_email.
-- Same username can exist under different client codes.
CREATE TABLE IF NOT EXISTS portal_users (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  username     VARCHAR(15)  NOT NULL,
  client_code  VARCHAR(15)  NOT NULL REFERENCES clients(client_code),
  auth_email   TEXT         NOT NULL,
  display_name TEXT,
  role         user_role    NOT NULL DEFAULT 'operator',
  is_active    BOOLEAN      NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT portal_users_username_client_code_key UNIQUE (username, client_code)
);

ALTER TABLE portal_users ENABLE ROW LEVEL SECURITY;

-- Anonymous users can look up auth_email during login
CREATE POLICY "login_lookup"
  ON portal_users FOR SELECT
  TO anon
  USING (true);

-- Authenticated users can see members of their own org
CREATE POLICY "see_own_org"
  ON portal_users FOR SELECT
  TO authenticated
  USING (client_code = get_my_client_code());

-- ── Seed ─────────────────────────────────────────────────────
INSERT INTO portal_users (username, client_code, auth_email, display_name, role)
VALUES ('abdulaziz', 'DEMO', 'abd.khayyat@gmail.com', 'Abdulaziz', 'admin')
ON CONFLICT (username, client_code) DO NOTHING;

-- demo user mapped to DEMO2 client
-- NOTE: you must create this auth user first (see instructions below)
INSERT INTO portal_users (username, client_code, auth_email, display_name, role)
VALUES ('demo', 'DEMO2', 'demo@logistricks.portal', 'Demo', 'admin')
ON CONFLICT (username, client_code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- AFTER running this migration, do the following in Supabase:
--
-- 1. Go to Auth → Users → Add User
--    Email:    demo@logistricks.portal
--    Password: (choose a strong password)
--    Email Confirm: ON
--
-- 2. Run this to point the auto-created profile to DEMO2:
--    UPDATE profiles SET client_code = 'DEMO2'
--    WHERE id = (
--      SELECT id FROM auth.users
--      WHERE email = 'demo@logistricks.portal'
--    );
-- ─────────────────────────────────────────────────────────────
