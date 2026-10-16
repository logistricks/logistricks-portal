-- 074_shipment_types.sql
-- Shipment types (Air / Sea FCL / Sea LCL / Land) and their extra fields. ADDITIVE ONLY: every column is nullable,
-- nothing existing is changed or removed, and there is NO backfill (old requests keep today's layout, can be typed by hand).
-- The is_sea / is_air / is_land flags stay and are kept in sync by the portal, so carrier matching keeps working.
-- Take a Supabase CSV export first (freight_requests, client_settings, quotations, carrier_quotes, carrier_quote_requests, inbound_emails, templates).
-- To undo: 074_shipment_types_down.sql (kept in supabase/rollback).

ALTER TABLE freight_requests
  ADD COLUMN IF NOT EXISTS shipment_type             text CHECK (shipment_type IN ('air','sea_fcl','sea_lcl','land')),
  ADD COLUMN IF NOT EXISTS type_source               text CHECK (type_source IN ('ai','manual')),
  ADD COLUMN IF NOT EXISTS cbm                       text,
  ADD COLUMN IF NOT EXISTS chargeable_weight         text,
  ADD COLUMN IF NOT EXISTS chargeable_weight_stated  text,
  ADD COLUMN IF NOT EXISTS package_type              text,
  ADD COLUMN IF NOT EXISTS cargo_ready_date          text,
  ADD COLUMN IF NOT EXISTS temperature_control       text,
  ADD COLUMN IF NOT EXISTS truck_type                text,
  ADD COLUMN IF NOT EXISTS cargo_lines               jsonb,
  -- extra quoted legs for mixed-mode requests (leg 1 lives in the normal columns); same field keys + shipment_type per item
  ADD COLUMN IF NOT EXISTS legs                      jsonb;

CREATE INDEX IF NOT EXISTS freight_requests_shipment_type_idx ON freight_requests (client_code, shipment_type);
