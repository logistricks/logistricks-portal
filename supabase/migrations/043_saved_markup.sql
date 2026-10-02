-- Remember the markup entered for each carrier quote, and whether the % is shown to the requester.
ALTER TABLE carrier_quotes
  ADD COLUMN IF NOT EXISTS markup_type text NOT NULL DEFAULT 'flat',
  ADD COLUMN IF NOT EXISTS markup_amount numeric,
  ADD COLUMN IF NOT EXISTS show_markup_percent boolean NOT NULL DEFAULT false;

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS show_markup_percent boolean NOT NULL DEFAULT false;
