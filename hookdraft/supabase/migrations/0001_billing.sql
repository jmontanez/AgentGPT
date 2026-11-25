-- HookDraft accounts: plan state (written by the Stripe webhook) and a usage log
-- (written by the API after each successful generation). Users can read only their
-- own rows; all writes go through the server with the service-role key.

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  stripe_customer_id text unique,
  -- Mirrors the Stripe subscription status; 'free' means no subscription.
  plan text not null default 'free'
    check (plan in ('free', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused')),
  current_period_end timestamptz,
  trial_used boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('script', 'variations')),
  units int not null check (units > 0),
  created_at timestamptz not null default now()
);
create index usage_user_time on public.usage (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.usage enable row level security;

create policy "read own profile" on public.profiles for select to authenticated using (user_id = (select auth.uid()));
create policy "read own usage" on public.usage for select to authenticated using (user_id = (select auth.uid()));

-- Create a profile row for every new sign-up.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, email) values (new.id, new.email) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only the trigger should run this; keep it off the public API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
