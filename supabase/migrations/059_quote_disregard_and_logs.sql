-- 059: disregarded carrier quotes + a "quotation" type in the auto-reply log. Run in the Supabase SQL editor.
ALTER TABLE public.carrier_quotes
  ADD COLUMN IF NOT EXISTS disregarded    boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS disregarded_at timestamptz,
  ADD COLUMN IF NOT EXISTS disregarded_by text;

ALTER TABLE public.auto_reply_logs DROP CONSTRAINT IF EXISTS auto_reply_logs_log_type_check;
ALTER TABLE public.auto_reply_logs
  ADD CONSTRAINT auto_reply_logs_log_type_check CHECK (log_type IN ('acknowledgement', 'missing_fields', 'carrier', 'quotation'));
