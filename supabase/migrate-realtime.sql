-- Run once in the SQL Editor, after schema.sql and migrate-offensive.sql.
--
-- Makes row changes push to subscribers, so REX sees a grant the moment it is
-- made rather than at the next poll. Without this the table publishes nothing
-- and a subscription is simply quiet — which looks exactly like "connected and
-- nothing changed", and is the harder failure to notice of the two.
--
-- Row Level Security still applies to the stream: a subscriber receives changes
-- to rows it could have read anyway, so this widens what is timely, not what is
-- visible.

alter publication supabase_realtime add table public.profiles;
