-- One quotation can cover several destination options (a combined quotation): the carrier quotes it is built from.
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS carrier_quote_ids jsonb;
