-- Undo of 078_quote_option.sql
ALTER TABLE carrier_quotes DROP COLUMN IF EXISTS leg_index;
