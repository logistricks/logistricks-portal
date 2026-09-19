-- 019_portal_users_viewer_role.sql
-- Add 'viewer' to the user_role enum and the carrier/mode restriction columns.

-- 1. Extend the enum
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'viewer';

-- 2. Carrier and mode restriction lists (empty = unrestricted for admin/operator;
--    viewer sees only their allowed carriers / modes)
ALTER TABLE public.portal_users
  ADD COLUMN IF NOT EXISTS allowed_carriers TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS allowed_modes    TEXT[] NOT NULL DEFAULT '{}';
