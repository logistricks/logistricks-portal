-- Critical (required-to-quote) fields chosen per shipment type in Settings.
-- Shape: {"air": ["cargo_type","weight",...], "sea_fcl": [...], "sea_lcl": [...], "land": [...]}
-- NULL (or a missing type) = the built-in rules of that type.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS critical_fields_by_type JSONB;
