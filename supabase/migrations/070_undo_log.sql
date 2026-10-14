-- Undo journal: before-images of portal changes so the last change can be reverted from the "Undo" popup.
CREATE TABLE IF NOT EXISTS public.undo_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_code TEXT        NOT NULL,
  username    TEXT        NOT NULL,
  label       TEXT        NOT NULL,
  ops         JSONB       NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS undo_log_created_idx ON public.undo_log (created_at);
ALTER TABLE public.undo_log ENABLE ROW LEVEL SECURITY;  -- service role only
