-- 027_missing_reply_template.sql
-- Adds support for a "missing data" auto-reply template and its toggle flag.

ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS is_missing_reply_template BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.templates.is_missing_reply_template IS
  'When true, this template is sent as the auto-reply when critical data is missing (requires require_critical_data and auto_reply_missing_enabled to be set on the client).';

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS auto_reply_missing_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clients.auto_reply_missing_enabled IS
  'When true AND require_critical_data is also true, the system sends the is_missing_reply_template instead of the standard is_reply_template when missing_fields is non-empty.';
