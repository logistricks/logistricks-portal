-- How many times a lead may read an email inside one try (set per lead in the trial admin). The old fixed limit was 3.
alter table trial_leads add column if not exists reads_per_try integer not null default 3;
