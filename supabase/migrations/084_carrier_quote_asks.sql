-- 084: every time the portal asks a carrier to correct a quote (automatically by a rule, or by a person with one click).
-- The count per request and carrier is what stops the portal from asking again and again (Settings → Rules → maximum asks).
CREATE TABLE IF NOT EXISTS public.carrier_quote_asks (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_code        citext NOT NULL REFERENCES public.clients(client_code) ON DELETE CASCADE ON UPDATE CASCADE,
  freight_request_id uuid   NOT NULL,
  carrier_id         bigint,                                   -- carriers.id (the row the RFQ went to)
  carrier_quote_id   text,
  codes              text[] NOT NULL DEFAULT '{}',             -- which problems were raised
  mode               text   NOT NULL DEFAULT 'auto' CHECK (mode IN ('auto', 'manual')),
  status             text   NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  to_email           text,
  subject            text,
  body               text,
  error              text,
  created_by         text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS carrier_quote_asks_req_idx ON public.carrier_quote_asks (client_code, freight_request_id, carrier_id);
ALTER TABLE public.carrier_quote_asks ENABLE ROW LEVEL SECURITY;   -- read/written only through the portal API (service role)
