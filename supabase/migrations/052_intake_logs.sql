-- 052: log of every manual email intake (drop / paste) — what the portal sent to n8n and what came back.
CREATE TABLE IF NOT EXISTS public.intake_logs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_code      citext NOT NULL REFERENCES public.clients(client_code) ON DELETE CASCADE ON UPDATE CASCADE,
  kind             text   NOT NULL DEFAULT 'request',          -- request | carrier_reply
  source           text   NOT NULL DEFAULT 'manual',
  filename         text,
  from_email       text,
  subject          text,
  message_id       text,
  status           text   NOT NULL DEFAULT 'running'
                   CHECK (status IN ('running', 'success', 'failed', 'unconfirmed', 'ignored')),
  stage            text,                                       -- last step reached (sent_to_n8n, n8n_done, …)
  http_status      int,
  error            text,
  n8n_response     text,                                       -- raw n8n reply (truncated)
  result           jsonb,                                      -- what the portal found afterwards (request, decision, match …)
  freight_request_id uuid,
  created_by       text,
  started_at       timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz,
  duration_ms      int
);
CREATE INDEX IF NOT EXISTS intake_logs_client_started_idx ON public.intake_logs (client_code, started_at DESC);
ALTER TABLE public.intake_logs ENABLE ROW LEVEL SECURITY;   -- read/written only through the portal API (service role)
