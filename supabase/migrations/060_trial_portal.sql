-- Lead trial portal (try.logistricks.com). Service-role only: RLS on, no policies.
-- Never stored: email text, sender address, any email domain. Parsed fields live in trial_runs.data and are purged
-- 5 days after the lead's last activity (see lib/trial-server.ts purgeTrialData).

create table if not exists trial_leads (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  contact_name text,
  code text not null unique,
  password_hash text not null,
  tries_total int not null default 2,
  tries_used int not null default 0,
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active','disabled')),
  converted boolean not null default false,
  notes text,
  first_login_at timestamptz,
  last_active_at timestamptz,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists trial_runs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references trial_leads(id) on delete cascade,
  try_no int not null,
  started_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  finished_at timestamptz,
  input_source text,                 -- sample | paste | file
  mode text,
  route_from text,
  route_to text,
  cargo text,
  parse_calls int not null default 1,
  parse1_ok boolean not null default false,
  parse2_ok boolean not null default false,
  markup_type text,
  markup_value numeric,
  final_price numeric,
  currency text,
  template text not null default 'default',
  format text,
  duration_ms bigint,
  data jsonb,                        -- parsed content only; null once purged
  data_purged_at timestamptz
);
create index if not exists trial_runs_lead_idx on trial_runs(lead_id, try_no);

create table if not exists trial_events (
  id bigserial primary key,
  lead_id uuid references trial_leads(id) on delete cascade,
  run_id uuid references trial_runs(id) on delete set null,
  type text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists trial_events_lead_idx on trial_events(lead_id, created_at desc);

alter table trial_leads enable row level security;
alter table trial_runs enable row level security;
alter table trial_events enable row level security;
