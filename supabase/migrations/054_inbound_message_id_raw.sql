-- 054: keep each inbound email's Message-ID exactly as it was received (message_id stays lower-cased for matching).
-- Replies sent by the portal use it in In-Reply-To / References so mail apps thread them under the client's email.
ALTER TABLE public.inbound_emails ADD COLUMN IF NOT EXISTS message_id_raw text;
