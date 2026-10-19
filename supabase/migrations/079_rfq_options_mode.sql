-- How a request with several destination options is sent to a carrier:
--   'separate' (default) = one email per destination option, each with its own RFQ reference
--   'one'                = one email per carrier that lists every destination
ALTER TABLE clients ADD COLUMN IF NOT EXISTS rfq_options_mode text NOT NULL DEFAULT 'separate';
