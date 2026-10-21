-- 088: one place for things that went wrong, so nothing fails silently.
-- Written by the portal itself (email failures, AI failures, failed automatic sends, cron errors) and by one shared n8n error workflow.
-- The same problem repeating is ONE row with a count (fingerprint), and it stays open until a person resolves it.
CREATE TABLE IF NOT EXISTS public.system_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_code  citext REFERENCES public.clients(client_code) ON DELETE CASCADE ON UPDATE CASCADE,   -- null: could not be matched to a client
  source       text NOT NULL CHECK (source IN ('portal', 'n8n')),
  kind         text NOT NULL,                                -- email_failed, ai_failed, auto_send_failed, workflow_error, silent_noop …
  severity     text NOT NULL DEFAULT 'error' CHECK (severity IN ('error', 'warning')),
  title        text NOT NULL,
  message      text,
  workflow     text,
  node         text,
  execution_id text,
  request_id   uuid,
  context      jsonb,
  fingerprint  text NOT NULL,
  count        int  NOT NULL DEFAULT 1,
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  first_seen   timestamptz NOT NULL DEFAULT now(),
  last_seen    timestamptz NOT NULL DEFAULT now(),
  resolved_by  text,
  resolved_at  timestamptz
);
CREATE INDEX IF NOT EXISTS system_events_open_idx ON public.system_events (client_code, status, last_seen DESC);
CREATE INDEX IF NOT EXISTS system_events_fp_idx ON public.system_events (fingerprint) WHERE status = 'open';
ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY;   -- read/written only through the portal API (service role)
