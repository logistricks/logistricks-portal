-- ============================================================
-- 008_portal_users.sql
-- Introduces portal_users table for username + client_code login.
-- Run in Supabase SQL Editor.
-- ============================================================

-- ── portal_users ─────────────────────────────────────────────
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

CREATE POLICY "login_lookup"
  ON portal_users FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "see_own_org"
  ON portal_users FOR SELECT
  TO authenticated
  USING (client_code = get_my_client_code());

-- ── Seed ─────────────────────────────────────────────────────
INSERT INTO portal_users (username, client_code, auth_email, display_name, role)
VALUES ('abdulaziz', 'DEMO', 'abd.khayyat@gmail.com', 'Abdulaziz', 'admin')
ON CONFLICT (username, client_code) DO NOTHING;

-- demo user under the same DEMO client
INSERT INTO portal_users (username, client_code, auth_email, display_name, role)
VALUES ('demo', 'DEMO', 'demo@logistricks.portal', 'Demo', 'admin')
ON CONFLICT (username, client_code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- After running this migration:
-- 1. Go to Auth → Users → Add User
--    Email:    demo@logistricks.portal
--    Password: (your choice)
-- The demo user's profile will auto-assign to DEMO via trigger.
-- ─────────────────────────────────────────────────────────────
