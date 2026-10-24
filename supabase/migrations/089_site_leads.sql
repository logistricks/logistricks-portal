-- Leads from the public website (www.logistricks.net). Written only by the site's server route (service role).
create table if not exists site_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  kind text not null default 'trial' check (kind in ('trial', 'demo')),   -- 'demo' when they tap "I want a demo instead"
  demo_requested_at timestamptz,
  status text not null default 'new' check (status in ('new', 'contacted', 'trial_sent', 'demo_booked', 'won', 'lost')),
  notes text,
  source jsonb,        -- where they came from: utm tags, referrer, which form
  meta jsonb,          -- calculator inputs, if they used it
  user_agent text
);
create index if not exists site_leads_created_idx on site_leads (created_at desc);
create index if not exists site_leads_email_idx on site_leads (lower(email));
alter table site_leads enable row level security;   -- no policies: only the service role can read or write
