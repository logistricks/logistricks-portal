-- ============================================================
-- 024_per_user_notifications.sql
-- Per-user notification read state and per-user push subscriptions.
-- ============================================================

-- 1. Per-user read tracking
--    notifications.read_at is kept for backward compat but ignored by the API.
CREATE TABLE IF NOT EXISTS public.notification_reads (
  notification_id  UUID        NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id          UUID        NOT NULL REFERENCES public.portal_users(id)  ON DELETE CASCADE,
  read_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS notification_reads_user_idx
  ON public.notification_reads (user_id);

-- 2. Tie push subscriptions to a portal user so each person's device is tracked.
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.portal_users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
  ON public.push_subscriptions (user_id);

-- 3. Track last login time per user
ALTER TABLE public.portal_users
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
