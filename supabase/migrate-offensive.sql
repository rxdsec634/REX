-- Run once in the SQL Editor, on a project already created from schema.sql.
--
-- Two changes, both because approval was gating the wrong thing.
--
-- Ordinary use is a 14-day trial that the devices table already limits to one
-- machine, so making every user wait on a human bought very little and cost
-- each of them their first session. Offensive tooling is the opposite: that is
-- REX pointed at someone else's systems, and it is worth deciding by name.

-- 1. Ordinary access is open. Anyone who signs in starts their trial at once.
alter table public.profiles alter column approved set default true;
update public.profiles set approved = true where approved = false;

-- 2. Offensive tooling is granted per person, and starts off.
alter table public.profiles add column if not exists offensive boolean not null default false;

-- No grant change is needed: authenticated users may only write `name`, so
-- `offensive` is already unwritable by the person it applies to.
