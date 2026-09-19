-- 018_portal_users_password.sql
-- Ensure password_hash column exists on portal_users.
-- (May already be present from a prior manual step; ADD COLUMN IF NOT EXISTS is safe to re-run.)

ALTER TABLE public.portal_users
  ADD COLUMN IF NOT EXISTS password_hash TEXT;
