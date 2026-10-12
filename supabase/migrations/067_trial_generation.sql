-- 067: trial AI generation. Prompts the owner can edit from the trial console (blank row = built-in default in lib/trial-gen.ts).
create table if not exists trial_prompts (
  key text primary key,            -- gen_request | gen_quote | kw_guard
  body text not null,
  updated_at timestamptz not null default now()
);
alter table trial_prompts enable row level security;   -- service role only
