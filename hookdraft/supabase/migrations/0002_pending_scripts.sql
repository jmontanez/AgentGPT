-- Scripts generated before sign-in. The visitor sees only the hooks; the full script waits here
-- until they sign in and claim it (which uses their free script). Server-only: RLS on, no policies.
-- ip_hash is a salted hash, never the raw address; it limits how many unsigned scripts one
-- connection can start per day.
create table public.pending_scripts (
  id uuid primary key default gen_random_uuid(),
  request jsonb not null,
  script jsonb not null,
  ip_hash text not null,
  claimed_by uuid references auth.users (id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);
create index pending_scripts_ip_time on public.pending_scripts (ip_hash, created_at desc);
alter table public.pending_scripts enable row level security;
