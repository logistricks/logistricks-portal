-- Migration 023: email sources (IMAP + Microsoft 365 Modern Auth)
-- Run in Supabase SQL editor

CREATE TABLE IF NOT EXISTS public.email_sources (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_code      CITEXT      NOT NULL REFERENCES public.clients(client_code) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  provider         TEXT        NOT NULL DEFAULT 'imap',
  -- Generic IMAP
  imap_host        TEXT,
  imap_port        INT         DEFAULT 993,
  imap_username    TEXT,
  imap_password    TEXT,        -- MVP: plaintext. Encrypt at rest in production.
  imap_tls         BOOLEAN     NOT NULL DEFAULT TRUE,
  -- Microsoft 365 Modern Auth (OAuth2)
  ms_tenant_id     TEXT,
  ms_client_id     TEXT,
  ms_client_secret TEXT,
  ms_email         TEXT,
  -- Common
  active           BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT email_sources_provider_check
    CHECK (provider IN ('imap', 'microsoft365'))
);

CREATE INDEX IF NOT EXISTS idx_email_sources_client
  ON public.email_sources(client_code);
