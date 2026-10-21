-- 086: AI check of a generated quotation against the request and the carrier's reply.
-- One row per check run. A check belongs to the exact text it looked at (content_hash): once the quotation is edited the result is "stale".
-- Rows also serve as the usage counter (checks per month, per client).
CREATE TABLE IF NOT EXISTS public.quotation_checks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_code  citext NOT NULL REFERENCES public.clients(client_code) ON DELETE CASCADE ON UPDATE CASCADE,
  quotation_id bigint NOT NULL,
  content_hash text   NOT NULL,
  verdict      text   NOT NULL CHECK (verdict IN ('ok', 'warnings', 'problems')),
  ai_ok        boolean NOT NULL DEFAULT true,                 -- false: the AI part could not run, only the fixed checks did (not counted as usage)
  findings     jsonb  NOT NULL DEFAULT '[]'::jsonb,           -- [{id, severity, topic, message, source}]
  suggestions  jsonb  NOT NULL DEFAULT '[]'::jsonb,           -- [{id, finding_id, find, replace, reason, applied}]
  mode         text   NOT NULL DEFAULT 'manual' CHECK (mode IN ('auto', 'manual')),
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quotation_checks_q_idx ON public.quotation_checks (quotation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quotation_checks_usage_idx ON public.quotation_checks (client_code, created_at DESC);
ALTER TABLE public.quotation_checks ENABLE ROW LEVEL SECURITY;   -- read/written only through the portal API (service role)
