-- Microsoft 365 "modern authentication" (OAuth 2.0 client credentials) for the outgoing email server.
ALTER TABLE public.smtp_settings
  ADD COLUMN IF NOT EXISTS auth_method          TEXT NOT NULL DEFAULT 'password',   -- password | oauth2_microsoft
  ADD COLUMN IF NOT EXISTS ms_tenant_id         TEXT,
  ADD COLUMN IF NOT EXISTS ms_client_id         TEXT,
  ADD COLUMN IF NOT EXISTS ms_client_secret_enc TEXT;
