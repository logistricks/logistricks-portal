-- 050: store every email the system sees (provider-independent) + the subject / Message-ID of each request.
-- Used to decide whether an incoming email is a reply to an existing request or a new one.

ALTER TABLE public.freight_requests
  ADD COLUMN IF NOT EXISTS subject            text,
  ADD COLUMN IF NOT EXISTS message_id         text,
  ADD COLUMN IF NOT EXISTS related_request_id uuid REFERENCES public.freight_requests(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.freight_requests.related_request_id IS 'Set when a new request may actually be a reply to this older request (needs a human check).';
CREATE INDEX IF NOT EXISTS freight_requests_client_sender_idx ON public.freight_requests (client_code, lower(sender_email));

CREATE TABLE IF NOT EXISTS public.inbound_emails (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_code        citext NOT NULL REFERENCES public.clients(client_code) ON DELETE CASCADE ON UPDATE CASCADE,
  direction          text   NOT NULL DEFAULT 'in' CHECK (direction IN ('in', 'out')),
  kind               text   NOT NULL DEFAULT 'other' CHECK (kind IN ('request', 'requester_reply', 'carrier_reply', 'other')),
  source             text,                 -- gmail | outlook | imap | manual
  mailbox            text,
  message_id         text,                 -- RFC Message-ID, lower-case, no angle brackets
  in_reply_to        text,
  "references"       text[] NOT NULL DEFAULT '{}',
  provider_thread_id text,
  subject            text,
  subject_normalized text,
  from_email         text,
  from_name          text,
  to_emails          text[] NOT NULL DEFAULT '{}',
  cc_emails          text[] NOT NULL DEFAULT '{}',
  received_at        timestamptz NOT NULL DEFAULT now(),
  body_text          text,
  attachment_count   integer NOT NULL DEFAULT 0,
  freight_request_id uuid REFERENCES public.freight_requests(id) ON DELETE SET NULL,
  match_method       text,                 -- thread | headers | ref_code | subject_sender | ai | none
  match_confidence   numeric(4,3),
  match_reason       text,
  review_status      text NOT NULL DEFAULT 'auto' CHECK (review_status IN ('auto', 'needs_review', 'confirmed', 'rejected')),
  ai_decision        jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS inbound_emails_msgid_key ON public.inbound_emails (client_code, message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS inbound_emails_request_idx ON public.inbound_emails (freight_request_id);
CREATE INDEX IF NOT EXISTS inbound_emails_thread_idx  ON public.inbound_emails (client_code, provider_thread_id) WHERE provider_thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS inbound_emails_from_idx    ON public.inbound_emails (client_code, lower(from_email), received_at DESC);
ALTER TABLE public.inbound_emails ENABLE ROW LEVEL SECURITY;  -- service role only (portal API + n8n through the portal)
