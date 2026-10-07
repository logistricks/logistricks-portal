-- Migration 055: IMAP mailboxes read by the portal itself
-- • the IMAP password is stored encrypted (imap_password_enc); the old plain column is emptied when a source is saved or polled
-- • per-mailbox cursor so each email is handed to the workflow once (uid + uidvalidity), plus last check status
ALTER TABLE public.email_sources
  ADD COLUMN IF NOT EXISTS imap_password_enc   TEXT,
  ADD COLUMN IF NOT EXISTS imap_last_uid       BIGINT,
  ADD COLUMN IF NOT EXISTS imap_uidvalidity    BIGINT,
  ADD COLUMN IF NOT EXISTS imap_last_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS imap_last_error     TEXT;
