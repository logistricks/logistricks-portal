-- Remember, per carrier quote, how the markup is shown and any manually edited customer prices.
ALTER TABLE carrier_quotes
  ADD COLUMN IF NOT EXISTS charges_style text,
  ADD COLUMN IF NOT EXISTS price_lines jsonb;
