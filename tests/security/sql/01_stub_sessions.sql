-- Local stand in for the provider's session tables, run after 00_stub.sql.
-- Mirrors the shape that matters here: sessions belong to a user, refresh tokens belong to a session and go with it.
-- That cascade is an assumption about the real provider schema, confirmed by the proof script (milestone 3b).
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, created_at timestamptz default now());
create table auth.refresh_tokens (id bigserial primary key, token text, user_id text, session_id uuid references auth.sessions(id) on delete cascade);

-- Supabase grants every new table and function in public to its API roles by default. Migrations must take that
-- access away explicitly, so the stub models the default or the tests would pass for the wrong reason.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
