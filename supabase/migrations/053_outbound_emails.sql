-- 053: every email the portal sends on a client's behalf (RFQs to carriers, auto-replies to requesters),
-- sent through the client's own SMTP settings by the portal mail gateway (/api/mail/send, /api/auto-reply).
CREATE TABLE IF NOT EXISTS public.outbound_emails (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_code        citext NOT NULL REFERENCES public.clients(client_code) ON DELETE CASCADE ON UPDATE CASCADE,
  purpose            text   NOT NULL CHECK (purpose IN ('rfq', 'reply', 'other')),
  freight_request_id uuid,
  rfq_reference      text,
  to_emails          text[] NOT NULL DEFAULT '{}',
  cc_emails          text[] NOT NULL DEFAULT '{}',
  subject            text,
  message_id         text,                    -- RFC Message-ID we generated (lower-case, no angle brackets)
  in_reply_to        text,
  status             text   NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error              text,
  redirected         boolean NOT NULL DEFAULT false,   -- true when MAIL_REDIRECT_TO sent it to the test address instead
  idempotency_key    text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  sent_at            timestamptz
);
-- Plain (not partial) unique index: NULL keys are distinct, so rows without a key never clash.
CREATE UNIQUE INDEX IF NOT EXISTS outbound_emails_idem_key ON public.outbound_emails (client_code, idempotency_key);
CREATE INDEX IF NOT EXISTS outbound_emails_client_created_idx ON public.outbound_emails (client_code, created_at DESC);
CREATE INDEX IF NOT EXISTS outbound_emails_request_idx ON public.outbound_emails (freight_request_id);
CREATE INDEX IF NOT EXISTS outbound_emails_msgid_idx ON public.outbound_emails (client_code, message_id);
ALTER TABLE public.outbound_emails ENABLE ROW LEVEL SECURITY;   -- only the portal API (service role) reads/writes
