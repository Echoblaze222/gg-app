\set ON_ERROR_STOP on
-- B1 first bootstrap works, second is refused, unknown member is refused
select t_raises('GG003', $q$select public.bootstrap_owner('99999999-9999-4999-8999-999999999999')$q$, 'B1 unknown member refused');
select public.bootstrap_owner('00000000-0000-4000-8000-000000000001');
select t_assert(exists (select 1 from member_roles where role='owner' and member_id='00000000-0000-4000-8000-000000000001'), 'B2 first owner created');
select t_raises('GG002', $q$select public.bootstrap_owner('00000000-0000-4000-8000-000000000002')$q$, 'B3 second owner refused');
select t_assert((select count(*) from member_roles where role='owner') = 1, 'B3 exactly one owner');
-- D1 session id unique when present, many nulls allowed
insert into device_sessions (member_id, session_id) values ('00000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111');
select t_raises('23505', $q$insert into device_sessions (member_id, session_id) values ('00000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111')$q$, 'D1 duplicate session id refused');
insert into device_sessions (member_id) values ('00000000-0000-4000-8000-000000000001'), ('00000000-0000-4000-8000-000000000001');
select t_assert((select count(*) from device_sessions where session_id is null) = 2, 'D2 null session ids allowed');
