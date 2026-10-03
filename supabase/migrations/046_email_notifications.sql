-- Email notifications: per-client SMTP server, one editable template per event, and a send log.

CREATE TABLE IF NOT EXISTS public.smtp_settings (
  client_code    CITEXT      PRIMARY KEY REFERENCES clients(client_code),
  host           TEXT        NOT NULL DEFAULT '',
  port           INTEGER     NOT NULL DEFAULT 587,
  security       TEXT        NOT NULL DEFAULT 'starttls',   -- ssl | starttls | none
  username       TEXT        NOT NULL DEFAULT '',
  password_enc   TEXT,                                        -- AES-256-GCM, never returned to the browser
  from_name      TEXT        NOT NULL DEFAULT '',
  from_email     TEXT        NOT NULL DEFAULT '',
  reply_to       TEXT,
  enabled        BOOLEAN     NOT NULL DEFAULT true,
  last_test_at   TIMESTAMPTZ,
  last_test_ok   BOOLEAN,
  last_test_error TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.notification_templates (
  id          BIGSERIAL   PRIMARY KEY,
  client_code CITEXT      NOT NULL REFERENCES clients(client_code),
  event_key   TEXT        NOT NULL,
  enabled     BOOLEAN     NOT NULL DEFAULT true,
  subject     TEXT        NOT NULL DEFAULT '',
  body_html   TEXT        NOT NULL DEFAULT '',
  recipients  JSONB       NOT NULL DEFAULT '{"roles":[],"extra":[]}'::jsonb,
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_code, event_key)
);

CREATE TABLE IF NOT EXISTS public.notification_log (
  id          BIGSERIAL   PRIMARY KEY,
  client_code CITEXT      NOT NULL,
  event_key   TEXT        NOT NULL,
  to_emails   TEXT[]      NOT NULL DEFAULT '{}',
  subject     TEXT,
  status      TEXT        NOT NULL,                          -- sent | failed | skipped
  error       TEXT,
  request_id  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notification_log_client_idx ON public.notification_log (client_code, created_at DESC);

-- Only the portal's server (service role) touches these tables.
ALTER TABLE public.smtp_settings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_log       ENABLE ROW LEVEL SECURITY;
