-- ============================================================================
-- RXDSEC / REX — Supabase schema
--
-- Run this once in the Supabase SQL Editor.
--
-- The security model has two halves, and BOTH are needed:
--
--   Row Level Security  decides WHICH ROWS a user may touch.
--   Column GRANTs       decide WHICH COLUMNS they may write.
--
-- RLS alone is not enough here. A policy's WITH CHECK sees only the new row,
-- so "you may update your own profile" would also let someone set their own
-- plan to 'pro'. Restricting the grant to the columns a user legitimately owns
-- is what actually closes that, and it is enforced by Postgres rather than by
-- application code that can be bypassed by calling the REST API directly.
-- ============================================================================

-- ------------------------------------------------------------------ profiles
-- One row per authenticated user. Created by a trigger on sign-up so a profile
-- can never be missing, and so the user never chooses its initial values.
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text,
  name          text,

  -- Set by the owner only, from the dashboard. Deliberately NOT writable by
  -- the user: these are the entitlement.
  approved      boolean     not null default false,
  plan          text        not null default 'trial'
                  check (plan in ('trial', 'pro', 'none')),
  suspended     boolean     not null default false,
  trial_ends_at timestamptz,

  created_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Read your own row. Nobody can list other users.
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Update your own row — narrowed to harmless columns by the GRANT below.
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- No insert or delete policy: rows are created by the trigger and removed only
-- by cascade from auth.users. A user cannot mint or destroy their own profile.

-- The half that stops privilege escalation. Without this, "update own profile"
-- would happily accept plan = 'pro'.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (name) on public.profiles to authenticated;

-- ------------------------------------------------------------------- devices
-- Machine binding. The id is a hash of stable hardware details, produced by
-- REX. It is the PRIMARY KEY on purpose: a device can be claimed exactly once,
-- so a second account cannot collect a second trial on the same machine. The
-- insert simply fails, and no policy has to reason about it.
create table if not exists public.devices (
  id            text        primary key,
  user_id       uuid        not null references public.profiles (id) on delete cascade,
  label         text,
  claimed_at    timestamptz not null default now()
);

alter table public.devices enable row level security;

drop policy if exists "read own devices" on public.devices;
create policy "read own devices"
  on public.devices for select
  using (auth.uid() = user_id);

-- Claim a device for yourself, and only for yourself.
drop policy if exists "claim own device" on public.devices;
create policy "claim own device"
  on public.devices for insert
  with check (auth.uid() = user_id);

-- No update and no delete: releasing a device is an owner decision, made in
-- the dashboard. Letting users delete their own rows would hand back the
-- unlimited-trials hole the primary key just closed.
revoke all on public.devices from anon, authenticated;
grant select, insert on public.devices to authenticated;

-- ----------------------------------------------------------------- heartbeat
-- One row, read weekly by a scheduled workflow. A free project pauses after
-- seven days with no database activity; this is what keeps the clock reset
-- before there are real users doing it naturally.
create table if not exists public.heartbeat (
  id         int primary key default 1,
  pinged_at  timestamptz not null default now(),
  constraint heartbeat_single_row check (id = 1)
);

insert into public.heartbeat (id) values (1) on conflict (id) do nothing;

alter table public.heartbeat enable row level security;

drop policy if exists "anyone may read heartbeat" on public.heartbeat;
create policy "anyone may read heartbeat"
  on public.heartbeat for select
  using (true);

revoke all on public.heartbeat from anon, authenticated;
grant select on public.heartbeat to anon, authenticated;

-- ------------------------------------------------------- profile on sign-up
-- SECURITY DEFINER so it may insert despite the table having no insert policy.
-- The user supplies nothing that matters: approved and plan take their
-- defaults, so a new account starts unapproved no matter what the client sends.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, trial_ends_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    now() + interval '14 days'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
