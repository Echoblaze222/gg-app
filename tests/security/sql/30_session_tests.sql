\set ON_ERROR_STOP on
create or replace function t_assert(ok boolean, name text) returns void language plpgsql as $$ begin if not ok then raise exception 'FAILED: %', name; end if; raise notice 'ok: %', name; end $$;
create or replace function t_raises(sqlstate_expected text, stmt text, name text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then
    if sqlstate = sqlstate_expected then raise notice 'ok: %', name; return; end if;
    raise exception 'FAILED: % (got %)', name, sqlstate;
  end;
  raise exception 'FAILED: % (no error raised)', name;
end $$;

-- fixtures: two members, ada has two sessions, bob has one
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'ada@example.com', now()),
  ('00000000-0000-4000-8000-0000000000b2', 'bob@example.com', now());
insert into auth.sessions (id, user_id) values
  ('10000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1'),
  ('10000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a1'),
  ('10000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b2');
insert into auth.refresh_tokens (token, session_id) values
  ('ta1', '10000000-0000-4000-8000-0000000000a1'), ('ta2', '10000000-0000-4000-8000-0000000000a2'), ('tb1', '10000000-0000-4000-8000-0000000000b1');
insert into session_reauth (session_id, member_id) values
  ('10000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1'),
  ('10000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a1'),
  ('10000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b2');

-- S1 ending one session needs the right owner: bob cannot end ada's session
select t_assert(public.revoke_session('00000000-0000-4000-8000-0000000000b2', '10000000-0000-4000-8000-0000000000a1') = false, 'S1 wrong owner ends nothing');
select t_assert((select count(*) from auth.sessions) = 3, 'S1 no session was deleted');
select t_assert((select count(*) from session_reauth) = 3, 'S1 no reauth row was deleted');
-- S2 ending one session ends only that one, with its refresh token and reauth row
select t_assert(public.revoke_session('00000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a1') = true, 'S2 owner ends own session');
select t_assert((select count(*) from auth.sessions where user_id='00000000-0000-4000-8000-0000000000a1') = 1, 'S2 the other session of the same user remains');
select t_assert((select count(*) from auth.refresh_tokens where token='ta1') = 0 and (select count(*) from auth.refresh_tokens where token='ta2') = 1, 'S2 only that session''s refresh token is gone');
select t_assert((select count(*) from session_reauth where session_id='10000000-0000-4000-8000-0000000000a1') = 0, 'S2 its reauth row is gone');
select t_assert((select count(*) from session_reauth where session_id='10000000-0000-4000-8000-0000000000a2') = 1, 'S2 the other reauth row remains');
-- S3 unknown session
select t_assert(public.revoke_session('00000000-0000-4000-8000-0000000000a1', gen_random_uuid()) = false, 'S3 unknown session returns false');
-- S4 ending every session touches only that user
select t_assert(public.revoke_all_sessions('00000000-0000-4000-8000-0000000000a1') = 1, 'S4 returns how many sessions were ended');
select t_assert((select count(*) from auth.sessions where user_id='00000000-0000-4000-8000-0000000000a1') = 0, 'S4 all sessions of the user are gone');
select t_assert((select count(*) from auth.refresh_tokens where token in ('ta1','ta2')) = 0, 'S4 their refresh tokens are gone');
select t_assert((select count(*) from session_reauth where member_id='00000000-0000-4000-8000-0000000000a1') = 0, 'S4 their reauth rows are gone');
select t_assert((select count(*) from auth.sessions where user_id='00000000-0000-4000-8000-0000000000b2') = 1, 'S4 another user''s session remains');
select t_assert((select count(*) from auth.refresh_tokens where token='tb1') = 1, 'S4 another user''s refresh token remains');
select t_assert((select count(*) from session_reauth where member_id='00000000-0000-4000-8000-0000000000b2') = 1, 'S4 another user''s reauth row remains');
-- S5 nothing to end is not an error
select t_assert(public.revoke_all_sessions('00000000-0000-4000-8000-0000000000a1') = 0, 'S5 user with no sessions returns 0');
select t_assert(public.revoke_all_sessions(gen_random_uuid()) = 0, 'S5 unknown user returns 0');
-- S6 only service_role can run either function
set role authenticated;
select t_raises('42501', $q$select public.revoke_all_sessions('00000000-0000-4000-8000-0000000000b2')$q$, 'S6 authenticated cannot end all sessions');
select t_raises('42501', $q$select public.revoke_session('00000000-0000-4000-8000-0000000000b2', '10000000-0000-4000-8000-0000000000b1')$q$, 'S6 authenticated cannot end a session');
reset role;
set role anon;
select t_raises('42501', $q$select public.revoke_all_sessions('00000000-0000-4000-8000-0000000000b2')$q$, 'S6 anon cannot end all sessions');
select t_raises('42501', $q$select public.revoke_session('00000000-0000-4000-8000-0000000000b2', '10000000-0000-4000-8000-0000000000b1')$q$, 'S6 anon cannot end a session');
reset role;
select t_assert((select count(*) from auth.sessions where user_id='00000000-0000-4000-8000-0000000000b2') = 1, 'S6 the refused calls changed nothing');
-- S7 the reauth table is closed to everyone but service_role
set role authenticated;
select t_raises('42501', $q$select * from session_reauth$q$, 'S7 authenticated cannot read reauth rows');
select t_raises('42501', $q$insert into session_reauth (session_id, member_id) values (gen_random_uuid(), '00000000-0000-4000-8000-0000000000b2')$q$, 'S7 authenticated cannot write reauth rows');
reset role;
set role anon;
select t_raises('42501', $q$select * from session_reauth$q$, 'S7 anon cannot read reauth rows');
reset role;
-- S8 service_role can use the table
set role service_role;
select t_assert((select count(*) from session_reauth) = 1, 'S8 service_role can read');
insert into session_reauth (session_id, member_id) values ('10000000-0000-4000-8000-0000000000b9', '00000000-0000-4000-8000-0000000000b2')
  on conflict (session_id) do update set confirmed_at = now();
select t_assert((select count(*) from session_reauth) = 2, 'S8 service_role can write');
reset role;
-- S9 a reauth row needs a real member
select t_raises('23503', $q$insert into session_reauth (session_id, member_id) values (gen_random_uuid(), gen_random_uuid())$q$, 'S9 reauth row for an unknown member is refused');
-- S10 row level security is on, and both functions pin their search path
select t_assert((select relrowsecurity from pg_class where oid = 'public.session_reauth'::regclass), 'S10 row level security enabled');
select t_assert((select bool_and(prosecdef and proconfig is not null and exists (select 1 from unnest(proconfig) c where c like 'search_path=%'))
                   from pg_proc where oid in ('public.revoke_all_sessions(uuid)'::regprocedure, 'public.revoke_session(uuid, uuid)'::regprocedure)), 'S10 security definer with a pinned search path');
