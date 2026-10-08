-- 058: how an outbound email was sent ('automatic' = portal/n8n through the client SMTP, 'manual' = the user sent it
-- from their own mail app and logged it in the portal). Run in the Supabase SQL editor.
ALTER TABLE public.outbound_emails ADD COLUMN IF NOT EXISTS method text;
