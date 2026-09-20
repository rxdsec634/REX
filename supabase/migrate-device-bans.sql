-- Device bans that outlive the account
--
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- The hole this closes: devices.user_id cascades from profiles, which cascades
-- from auth.users. So SUSPENDING an account leaves its device rows in place and
-- the machine stays claimed -- correct -- but DELETING the account removes them,
-- and the same machine can immediately claim a fresh fourteen-day trial under a
-- new email. The ban evaporates with the row it was attached to.
--
-- The fix is a ban list keyed by the device hash alone, referencing nothing, so
-- deleting a user cannot take it with them.

create table if not exists public.device_bans (
  id         text        primary key,   -- the same hardware hash REX sends
  reason     text,
  banned_at  timestamptz not null default now()
);

alter table public.device_bans enable row level security;

-- No policies, so anon and authenticated get nothing: a banned user must not be
-- able to read the ban list and confirm which of their machines is known. The
-- service key and the dashboard bypass RLS.
revoke all on public.device_bans from anon, authenticated;

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER on purpose, and this is the whole trick.
--
-- An RLS policy runs as the calling user. Putting a bare `not exists (select 1
-- from device_bans ...)` in the claim policy would read that table THROUGH RLS,
-- find nothing because the user may read nothing, and conclude the device is
-- clean -- an enforcement check that always passes. Running the lookup as the
-- function owner is what makes it actually see the rows.
create or replace function public.device_is_banned(p_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.device_bans where id = p_id);
$$;

revoke all on function public.device_is_banned(text) from public, anon;
grant execute on function public.device_is_banned(text) to authenticated;

-- Re-state the claim policy with the ban check folded in.
drop policy if exists "claim own device" on public.devices;
create policy "claim own device"
  on public.devices for insert
  with check (
    auth.uid() = user_id
    and not public.device_is_banned(id)
  );

-- ---------------------------------------------------------------------------
-- Ban every machine an account has claimed, and keep the rows.
--
--   select public.ban_user_devices('<uuid>', 'shared trials');
--
-- Call this BEFORE deleting a user, not after -- once the cascade has run there
-- is nothing left to read the hashes from.
create or replace function public.ban_user_devices(p_user uuid, p_reason text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  insert into public.device_bans (id, reason)
  select d.id, p_reason from public.devices d where d.user_id = p_user
  on conflict (id) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.ban_user_devices(uuid, text) from public, anon, authenticated;

-- Undo, for the case where it was the wrong machine.
--   select public.unban_device('<hash>');
create or replace function public.unban_device(p_id text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.device_bans where id = p_id;
$$;

revoke all on function public.unban_device(text) from public, anon, authenticated;
