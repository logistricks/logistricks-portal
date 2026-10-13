-- AI-written examples a lead may generate per rolling 24 hours (set per lead in the trial admin).
alter table trial_leads add column if not exists gen_limit integer not null default 12;
