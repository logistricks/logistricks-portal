-- 016_activity_log.sql
-- Activity log table for tracking portal events per client.

CREATE TABLE IF NOT EXISTS public.activity_log (
  id           BIGSERIAL    PRIMARY KEY,
  client_code  CITEXT       NOT NULL,
  event_type   TEXT         NOT NULL,
  actor        TEXT         NOT NULL DEFAULT 'system',
  description  TEXT         NOT NULL,
  request_id   UUID,
  meta         JSONB        NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS activity_log_client_time
  ON public.activity_log (client_code, created_at DESC);

CREATE INDEX IF NOT EXISTS activity_log_client_type
  ON public.activity_log (client_code, event_type);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
