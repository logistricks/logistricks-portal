-- ============================================================
-- 013_freight_mode_flags.sql
-- Replace modes TEXT[] with is_sea / is_air / is_land booleans.
-- Run in Supabase SQL Editor.
-- ============================================================

-- 1. Add the three flag columns
ALTER TABLE freight_requests
  ADD COLUMN IF NOT EXISTS is_sea  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_air  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_land BOOLEAN NOT NULL DEFAULT false;

-- 2. Migrate existing data from the TEXT[] column
UPDATE freight_requests SET
  is_sea  = ('Sea'  = ANY(modes)),
  is_air  = ('Air'  = ANY(modes)),
  is_land = ('Land' = ANY(modes))
WHERE modes IS NOT NULL AND array_length(modes, 1) > 0;

-- 3. Drop the old column
ALTER TABLE freight_requests DROP COLUMN IF EXISTS modes;

-- 4. Verify
SELECT id, is_sea, is_air, is_land FROM freight_requests LIMIT 5;
