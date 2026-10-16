-- 075_multi_leg.sql
-- Multi-leg requests: each RFQ remembers which leg of the request it was sent for, and templates can be marked as the
-- "multi-leg" quote request. ADDITIVE ONLY (nullable / default false). Undo: supabase/rollback/075_multi_leg_down.sql
ALTER TABLE carrier_quote_requests ADD COLUMN IF NOT EXISTS leg_index smallint;  -- null or 0 = leg 1 (the request itself), 1 = leg 2 ...
ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS mode_multi    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_multi boolean NOT NULL DEFAULT false;
