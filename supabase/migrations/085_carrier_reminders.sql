-- 085: reminders sent to carriers that haven't answered a rate request (automatically, or by a person with one click).
-- The count and the last time per RFQ is what stops the portal from reminding too often (Settings → Rules → Carrier reminders).
CREATE TABLE IF NOT EXISTS public.carrier_reminders (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_code              citext NOT NULL REFERENCES public.clients(client_code) ON DELETE CASCADE ON UPDATE CASCADE,
  freight_request_id       uuid   NOT NULL,
  carrier_quote_request_id bigint NOT NULL,                   -- the RFQ being chased
  carrier_id               bigint,                            -- carriers.id
  mode                     text   NOT NULL DEFAULT 'auto' CHECK (mode IN ('auto', 'manual')),
  status                   text   NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  to_email                 text,
  subject                  text,
  body                     text,
  error                    text,
  created_by               text,
  created_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS carrier_reminders_rfq_idx ON public.carrier_reminders (carrier_quote_request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS carrier_reminders_req_idx ON public.carrier_reminders (client_code, freight_request_id);
ALTER TABLE public.carrier_reminders ENABLE ROW LEVEL SECURITY;   -- read/written only through the portal API (service role)
