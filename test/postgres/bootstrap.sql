-- ONLY for the fresh halina_ci PostgreSQL service in GitHub Actions.
-- These are the Supabase schema dependencies needed to apply the real app
-- migrations. This does not run Supabase Auth, its Data API, or Realtime, and
-- must not be treated as end-to-end verification of those services.
DO $$
BEGIN
  IF current_database() <> 'halina_ci' THEN
    RAISE EXCEPTION 'CI bootstrap requires the disposable halina_ci database';
  END IF;
END $$;

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA realtime;

CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;
$$;

CREATE FUNCTION realtime.topic() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT current_setting('realtime.topic', true);
$$;

CREATE TABLE realtime.messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  extension text NOT NULL
);
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
