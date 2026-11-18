-- AI-2: per session password confirmations, and ending sessions by user id or by session id.
-- Why: the identity provider's admin API signs out by access token only. Ending every session of a user (password
-- reset, suspension, forced logout) and ending one session (device revoke) both happen where no token is held,
-- so they need SQL. Spec: docs/security/07-identity-adapter-spec.md (problems 2 and 5).
-- Everything here is reachable by service_role only. The functions live in public because only exposed schemas can
-- be called through the API, and execute rights are removed from every other role.

-- 1. Reauth confirmations. One row per auth session, written when the member re-enters their password.
-- No foreign key to auth.sessions (that schema belongs to the provider). Rows are removed by the two functions
-- below, and readers also apply a time window, so a stale row never grants anything on its own.
create table if not exists public.session_reauth (
  session_id   uuid primary key,
  member_id    uuid not null references public.members(id) on delete cascade,
  confirmed_at timestamptz not null default now()
);
create index if not exists session_reauth_member_idx on public.session_reauth (member_id);

alter table public.session_reauth enable row level security;  -- no policies: nobody but service_role gets in
revoke all on public.session_reauth from public, anon, authenticated;
grant select, insert, update, delete on public.session_reauth to service_role;

-- 2. End every session of a user. Returns how many sessions were ended.
-- Deleting the session rows also removes that session's refresh tokens (cascade, proven by the proof script),
-- so no new access token can be minted. Access tokens already issued stop working at the next live check.
create or replace function public.revoke_all_sessions(target_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare ended integer;
begin
  delete from public.session_reauth where member_id = target_user_id;
  delete from auth.sessions where user_id = target_user_id;
  get diagnostics ended = row_count;
  return ended;
end;
$$;

-- 3. End one session, only when it belongs to the given user. Returns false when there was nothing to end.
create or replace function public.revoke_session(target_user_id uuid, target_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare ended integer;
begin
  delete from auth.sessions where id = target_session_id and user_id = target_user_id;
  get diagnostics ended = row_count;
  delete from public.session_reauth where session_id = target_session_id and member_id = target_user_id;
  return ended > 0;
end;
$$;

revoke all on function public.revoke_all_sessions(uuid) from public, anon, authenticated;
revoke all on function public.revoke_session(uuid, uuid) from public, anon, authenticated;
grant execute on function public.revoke_all_sessions(uuid) to service_role;
grant execute on function public.revoke_session(uuid, uuid) to service_role;
