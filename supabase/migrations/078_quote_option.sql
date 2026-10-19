-- 078_quote_option.sql
-- A carrier replying to a request with alternative destinations ("Umm Qasr or Aqaba") quotes each destination separately.
-- leg_index says which option a quote is for: null = the whole request / not stated, 0 = option 1 (the request itself), 1 = option 2 ...
-- ADDITIVE ONLY (nullable). Undo: supabase/rollback/078_quote_option_down.sql
ALTER TABLE carrier_quotes ADD COLUMN IF NOT EXISTS leg_index smallint;
