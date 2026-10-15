-- 073_task_email_log.sql
-- Remembers which reminder emails were already sent (morning digest per day, urgent / escalation per task, weekly summary per week),
-- so the scheduled job can run as often as you like without sending anything twice.
CREATE TABLE IF NOT EXISTS task_email_log (
  client_code text        NOT NULL,
  key         text        NOT NULL,
  sent_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_code, key)
);
ALTER TABLE task_email_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS task_email_log_sent_at_idx ON task_email_log (sent_at);
