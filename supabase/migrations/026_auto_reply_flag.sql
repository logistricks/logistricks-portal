-- =====================================================================
-- 026_auto_reply_flag.sql
-- Adds auto_reply_enabled flag to the clients table.
-- Run in Supabase SQL Editor.
-- =====================================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS auto_reply_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clients.auto_reply_enabled IS
  'When true, an auto-reply email is sent to the sender after a new freight request is received.';
