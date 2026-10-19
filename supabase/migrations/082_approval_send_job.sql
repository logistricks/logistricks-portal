-- A carrier send that is held for approval: stored on the approval steps, run after the last approval.
alter table approval_requests add column if not exists send_job jsonb;
