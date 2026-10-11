-- 064: countries each carrier covers (ISO-2 codes). Used to suggest carriers for a request
-- and to choose carriers for automated RFQs. Empty = coverage not set yet.
ALTER TABLE carriers ADD COLUMN IF NOT EXISTS countries text[] NOT NULL DEFAULT '{}';
COMMENT ON COLUMN carriers.countries IS 'ISO 3166-1 alpha-2 codes of the countries this carrier covers; empty = not set';
