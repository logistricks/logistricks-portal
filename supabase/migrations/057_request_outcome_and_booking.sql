-- 057: what happened to a request after it was quoted: won / lost, which carrier quote and quotation won,
-- the price (snapshot of cost, sell and margin), what was booked (with reference), and invoice / payment marks.
ALTER TABLE public.freight_requests
  ADD COLUMN IF NOT EXISTS outcome              text CHECK (outcome IN ('won', 'lost', 'expired', 'cancelled')),
  ADD COLUMN IF NOT EXISTS outcome_at           timestamptz,
  ADD COLUMN IF NOT EXISTS outcome_by           text,
  ADD COLUMN IF NOT EXISTS outcome_reason       text,      -- lost reason: price | transit_time | service | no_response | cargo_cancelled | other
  ADD COLUMN IF NOT EXISTS outcome_note         text,
  ADD COLUMN IF NOT EXISTS won_carrier_quote_id bigint REFERENCES public.carrier_quotes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS won_quotation_id     bigint REFERENCES public.quotations(id)     ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS won_carrier_name     text,
  ADD COLUMN IF NOT EXISTS won_cost_usd         numeric(12, 2),   -- the carrier's price
  ADD COLUMN IF NOT EXISTS won_sell_usd         numeric(12, 2),   -- the price the requester accepted (quotation after markup)
  ADD COLUMN IF NOT EXISTS won_margin_usd       numeric(12, 2),   -- sell - cost
  ADD COLUMN IF NOT EXISTS booking_reference    text,
  ADD COLUMN IF NOT EXISTS booking_description  text,
  ADD COLUMN IF NOT EXISTS booked_at            timestamptz,
  ADD COLUMN IF NOT EXISTS invoiced_at          timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at              timestamptz;
CREATE INDEX IF NOT EXISTS freight_requests_outcome_idx ON public.freight_requests (client_code, outcome);
