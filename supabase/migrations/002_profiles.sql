-- ============================================================
-- 002_profiles.sql
-- Extends auth.users — links every Supabase user to a client.
-- Run AFTER 001_clients.sql.
-- ============================================================

-- Role enum
CREATE TYPE user_role AS ENUM ('admin', 'operator', 'viewer');

CREATE TABLE IF NOT EXISTS profiles (
  id           UUID         PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  client_code  VARCHAR(15)  NOT NULL REFERENCES clients(client_code),
  full_name    VARCHAR(100),
  role         user_role    NOT NULL DEFAULT 'operator',
  avatar_url   TEXT,
  is_active    BOOLEAN      NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ── Helper used by all RLS policies ─────────────────────────
-- SECURITY DEFINER so it can read profiles even under RLS.
CREATE OR REPLACE FUNCTION get_my_client_code()
RETURNS VARCHAR(15)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT client_code FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- Convenience: is the current user an admin for their client?
CREATE OR REPLACE FUNCTION i_am_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ── Auto-create profile on sign-up ──────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, client_code, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'client_code', 'DEMO'),
    NEW.raw_user_meta_data->>'full_name',
    COALESCE(
      (NEW.raw_user_meta_data->>'role')::user_role,
      'operator'
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── RLS: clients (needs get_my_client_code, defined above) ───
CREATE POLICY "clients_select_own"
  ON clients FOR SELECT
  USING (client_code = get_my_client_code());

-- ── RLS: profiles ────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_same_client"
  ON profiles FOR SELECT
  USING (client_code = get_my_client_code());

CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ── Seed: link Abdulaziz to DEMO ────────────────────────────
-- Run separately after this script:
--   SELECT id FROM auth.users WHERE email = 'abd.khayyat@gmail.com';
-- Then:
-- INSERT INTO profiles (id, client_code, full_name, role)
-- VALUES ('<YOUR_UUID>', 'DEMO', 'Abdulaziz', 'admin')
-- ON CONFLICT (id) DO UPDATE
--   SET client_code = 'DEMO', full_name = 'Abdulaziz', role = 'admin';
