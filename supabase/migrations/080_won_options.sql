-- A request with several destination options can win more than one of them (the customer books both).
-- won_options holds one record per won option: carrier quote, quotation, cost, sell, margin and its own booking / invoice / payment marks.
-- The existing won_* / booking_* columns keep the totals (sums, joined references) so reports keep working.
ALTER TABLE freight_requests ADD COLUMN IF NOT EXISTS won_options jsonb;
