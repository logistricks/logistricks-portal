ALTER TABLE templates DROP COLUMN IF EXISTS default_multi, DROP COLUMN IF EXISTS mode_multi;
ALTER TABLE carrier_quote_requests DROP COLUMN IF EXISTS leg_index;
