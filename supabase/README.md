# Supabase setup

Replaces the Node server entirely: Supabase Auth handles sign-in (Google,
GitHub, email), Postgres holds the data, and Row Level Security decides who may
touch what. There is nothing to deploy and nothing to keep running.

## 1. Create the schema

Supabase dashboard → **SQL Editor** → paste all of `schema.sql` → **Run**.

It creates `profiles`, `devices` and `heartbeat`, enables RLS on each, and adds
a trigger so a profile row exists the moment someone signs up — starting
**unapproved**, whatever the client sends.

## 2. Turn on the providers

**Authentication → Providers**

- **Google** — needs a Google OAuth client. Redirect URL is shown on the page;
  paste it into the Google console as the authorised redirect URI.
- **GitHub** — same shape, via a GitHub OAuth App.
- **Email** — leave on or off as you prefer. `PASSWORD_AUTH` no longer applies;
  this toggle replaces it.

## 3. Prove the rules actually hold

```bash
node supabase/verify-rls.mjs https://YOUR-PROJECT.supabase.co YOUR-ANON-KEY
```

It signs up two throwaway users and attacks the model as an ordinary user:
tries to set its own `plan` to `pro`, approve itself, clear `suspended`, read
somebody else's profile, list every user, claim a machine already claimed, claim
one in another user's name, and delete a device to free up a trial. **Every one
of those must fail.**

Run it after any policy change. Without a server in front, these rules are the
security — there is nothing else between a user's token and the table.

> Email confirmation must be off while running this, or the script cannot get
> tokens for its throwaway accounts.

## 4. Stop the project pausing

Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` as repository secrets. The weekly
workflow in `.github/workflows/supabase-heartbeat.yml` reads one row so the
seven-day inactivity clock never runs out. Once REX has users, their own
requests do this and the workflow is merely belt and braces.

## Why the columns are granted, not just the rows

RLS decides which **rows** you may touch; it cannot restrict which **columns**.
A policy saying "you may update your own profile" would therefore also permit
`plan = 'pro'`, because `WITH CHECK` only sees the new row and the row is still
yours. The fix is a column grant:

```sql
grant update (name) on public.profiles to authenticated;
```

Postgres then refuses the write itself, whatever the client sends. That is the
single most important line in the schema, and `verify-rls.mjs` exists to prove
it is working.

## The anon key is public

It ships in client code by design. It identifies the project, it does not grant
access — RLS does that. The key that must never leave the dashboard is
**`service_role`**, which bypasses RLS completely.
