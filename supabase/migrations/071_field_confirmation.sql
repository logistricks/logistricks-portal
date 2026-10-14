-- Field confirmation: a person confirms a request's cargo fields are right (the portal also treats an acknowledgment,
-- a carrier RFQ or a carrier quote as confirmation by itself — worked out from the existing tables, nothing stored).
ALTER TABLE public.freight_requests
  ADD COLUMN IF NOT EXISTS fields_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fields_confirmed_by TEXT,
  ADD COLUMN IF NOT EXISTS fields_edited_at    TIMESTAMPTZ;
