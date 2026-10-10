-- Owner logins for the trial console (try.logistricks.com/admin). Separate from clients and from leads.
-- Service role only (RLS on, no policies). The password is stored as a SHA-256 hash.
create table if not exists trial_admins (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);
alter table trial_admins enable row level security;

-- Create your login (change the two values, then run just this line):
--   insert into trial_admins (username, password_hash)
--   values ('azeez', encode(sha256('your-password'::bytea), 'hex'));
-- Change a password later:
--   update trial_admins set password_hash = encode(sha256('new-password'::bytea), 'hex') where username = 'azeez';
