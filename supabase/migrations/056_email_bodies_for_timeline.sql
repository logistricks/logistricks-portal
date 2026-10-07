-- 056: keep what we send, so the request timeline can show each email (from -> to, subject, text).
ALTER TABLE public.outbound_emails
  ADD COLUMN IF NOT EXISTS from_email text,
  ADD COLUMN IF NOT EXISTS body_text  text;
