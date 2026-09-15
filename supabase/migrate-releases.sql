-- Run once in the SQL Editor.
--
-- Where the download addresses live.
--
-- They were in a JSON file in the repository, which meant changing one was a
-- commit and a deploy, and the file could disagree with the release it
-- described — it did, twice: URLs built for a tag that was never used, and
-- checksums belonging to a build that had been replaced. Putting them in a
-- table makes the dashboard the one place they are edited, and there is nothing
-- to keep in step.
--
-- Everything here is public on purpose. A download address is not a secret, and
-- the page has to read it before anyone has signed in.

create table if not exists public.releases (
  id          bigint generated always as identity primary key,

  version     text        not null,
  channel     text        not null default 'stable',

  -- platform/arch are what the updater matches on. `kind` is for the download
  -- page, which shows several artifacts per platform — an installer and a
  -- portable build are both win32, and a person choosing between them needs
  -- the difference named.
  platform    text        not null check (platform in ('win32', 'linux', 'darwin')),
  arch        text,
  kind        text,

  url         text        not null,
  size        bigint,
  sha256      text,
  notes       text,

  -- Unpublish rather than delete: a row that turned out to be wrong is worth
  -- keeping to look at, and deleting is the one edit that cannot be undone
  -- from the dashboard.
  published   boolean     not null default true,

  created_at  timestamptz not null default now()
);

-- The updater asks for one platform at a time and takes the newest; the
-- download page asks for everything published. Both start from the same filter.
create index if not exists releases_lookup
  on public.releases (channel, platform, published, created_at desc);

alter table public.releases enable row level security;

-- Readable by anyone, including visitors who have never signed in — the
-- download page is the front of the site, not something behind a login.
drop policy if exists "anyone may read published releases" on public.releases;
create policy "anyone may read published releases"
  on public.releases for select
  using (published = true);

-- No insert, update or delete policy, and no grant for them: rows are written
-- in the dashboard, by the owner, as the owner. An API that could publish a
-- release would be an API that could point every user's updater at a binary of
-- someone else's choosing.
revoke all on public.releases from anon, authenticated;
grant select on public.releases to anon, authenticated;

-- ---------------------------------------------------------------- seeding
-- Adjust and run. sha256 is optional but strongly wanted: REX verifies the
-- download against it and refuses a mismatch, and an update it cannot verify
-- is the one thing worse than no update.
--
-- insert into public.releases (version, platform, arch, kind, url, size, sha256, notes) values
--   ('0.2.4', 'win32', 'x64', 'installer',
--    'https://github.com/rxdsec634/REX/releases/download/rex/REX.Setup.0.2.4.exe',
--    90496865, '27db430cc6256898…', 'Sign-in moved to Supabase.'),
--   ('0.2.4', 'linux', 'x64', 'deb',
--    'https://github.com/rxdsec634/REX/releases/download/rex/rex_0.2.4_amd64.deb',
--    122006156, 'e64cfe5b572d135e…', 'Sign-in moved to Supabase.');
