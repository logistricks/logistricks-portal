-- ============================================================
-- 035_reply_threading.sql
-- Adds reply threading and conversation tracking to freight requests,
-- a new "complete data" auto-reply template type, and its client toggle.
-- ============================================================

-- ── 1. freight_requests: thread tracking ────────────────────
ALTER TABLE public.freight_requests
  ADD COLUMN IF NOT EXISTS gmail_thread_id TEXT,
  ADD COLUMN IF NOT EXISTS replied_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reply_sent_type  TEXT CHECK (reply_sent_type IN ('missing_fields', 'acknowledgement', 'complete', 'manual')),
  ADD COLUMN IF NOT EXISTS reply_body       TEXT,
  ADD COLUMN IF NOT EXISTS conversation     JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.freight_requests.gmail_thread_id IS
  'Gmail threadId of the original inbound email — used to match sender replies back to this request.';
COMMENT ON COLUMN public.freight_requests.replied_at IS
  'Timestamp of the most recent auto-reply or manual reply sent to the original sender.';
COMMENT ON COLUMN public.freight_requests.reply_sent_type IS
  'Type of the last reply sent: missing_fields, acknowledgement, complete, or manual.';
COMMENT ON COLUMN public.freight_requests.reply_body IS
  'HTML body of the most recent reply sent to the original sender.';
COMMENT ON COLUMN public.freight_requests.conversation IS
  'Ordered log of all messages in this thread. Each entry: { role: "sender"|"system", body: string, sent_at: ISO, type?: string }';

CREATE INDEX IF NOT EXISTS fr_gmail_thread_id_idx ON public.freight_requests (gmail_thread_id)
  WHERE gmail_thread_id IS NOT NULL;

-- ── 2. auto_reply_logs: store the thread id ─────────────────
ALTER TABLE public.auto_reply_logs
  ADD COLUMN IF NOT EXISTS gmail_thread_id TEXT;

CREATE INDEX IF NOT EXISTS arl_gmail_thread_id_idx ON public.auto_reply_logs (gmail_thread_id)
  WHERE gmail_thread_id IS NOT NULL;

-- ── 3. templates: "complete data" auto-reply flag ───────────
ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS is_complete_reply_template BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.templates.is_complete_reply_template IS
  'When true, this template is sent as the auto-reply when all required fields are present and no missing_fields remain. One per client.';

-- Enforce one per client (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS templates_one_complete_reply_per_client
  ON public.templates (client_code)
  WHERE is_complete_reply_template = true;

-- ── 4. clients: toggle for the new template type ────────────
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS auto_reply_complete_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clients.auto_reply_complete_enabled IS
  'When true, send the is_complete_reply_template to the sender when all required fields are present.';
