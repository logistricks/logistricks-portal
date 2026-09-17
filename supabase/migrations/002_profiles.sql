-- ============================================================
-- 002_profiles.sql
-- Extends auth.users — links every Supabase user to a client.
-- Run AFTER 001_clients.sql.
-- ============================================================

-- Role enum
CREATE TYPE user_role AS ENUM ('admin', 'operator', 'viewer');

-- Drop any Supabase starter template table so we can recreate
-- it with the correct schema (safe on a fresh project).
DROP TABLE IF EXISTS profiles CASCADE;

CREATE TABLE profiles (
  id           UUID         PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  client_code  VARCHAR(15)  NOT NULL REFERENCES clients(client_code),
  full_name    VARCHAR(100),
  role         user_role    NOT NULL DEFAULT 'operator',
  avatar_url   TEXT,
  is_active    BOOLEAN      NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ── Helper used by all RLS policies ─────────────────────────
-- Using plpgsql (not sql) so body is validated at call-time,
-- not at creation time — avoids schema resolution issues.
CREATE OR REPLACE FUNCTION get_my_client_code()
RETURNS VARCHAR(15)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_code VARCHAR(15);
BEGIN
  SELECT client_code INTO v_code
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;
  RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION i_am_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_result BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- ── Auto-create profile on sign-up ──────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, client_code, full_name, role)
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

-- ── RLS: clients (policy here, after helper is defined) ──────
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

-- ── Seed: run this separately after the main script ─────────
-- 1. Find your UUID:
--    SELECT id FROM auth.users WHERE email = 'abd.khayyat@gmail.com';
-- 2. Then run:
-- INSERT INTO profiles (id, client_code, full_name, role)
-- VALUES ('<YOUR_UUID>', 'DEMO', 'Abdulaziz', 'admin')
-- ON CONFLICT (id) DO UPDATE
--   SET client_code = 'DEMO', full_name = 'Abdulaziz', role = 'admin';
