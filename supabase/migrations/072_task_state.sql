-- Tasks page: a task is worked out from each request's state (nothing stored). This only remembers what people did
-- with one: snoozed it until a time, or marked it "not needed".
CREATE TABLE IF NOT EXISTS public.task_state (
  id            BIGSERIAL   PRIMARY KEY,
  client_code   TEXT        NOT NULL,
  task_key      TEXT        NOT NULL,           -- <request id>:<task type>:<event stamp> — a new event gives a new key
  snoozed_until TIMESTAMPTZ,
  dismissed     BOOLEAN     NOT NULL DEFAULT FALSE,
  reason        TEXT,
  updated_by    TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_code, task_key)
);
ALTER TABLE public.task_state ENABLE ROW LEVEL SECURITY;  -- service role only
