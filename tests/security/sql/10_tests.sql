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

-- V1 unconfirmed signup stays pending
insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000001', 'a@example.com');
select t_assert((select status from members where id='00000000-0000-4000-8000-000000000001') = 'pending_verification', 'V1 unconfirmed user stays pending');
-- V2 email confirmation activates
update auth.users set email_confirmed_at = now() where id='00000000-0000-4000-8000-000000000001';
select t_assert((select status from members where id='00000000-0000-4000-8000-000000000001') = 'active', 'V2 confirmation activates');
select t_assert((select email_verified_at from members where id='00000000-0000-4000-8000-000000000001') is not null, 'V2 verified timestamp set');
-- V3 already confirmed at creation (Google style) is active at once
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-4000-8000-000000000002', 'g@example.com', now());
select t_assert((select status from members where id='00000000-0000-4000-8000-000000000002') = 'active', 'V3 provider verified user active on insert');
-- V4 a suspended member is not reactivated by a later confirmation
insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000003', 's@example.com');
update members set status='suspended' where id='00000000-0000-4000-8000-000000000003';
update auth.users set email_confirmed_at = now() where id='00000000-0000-4000-8000-000000000003';
select t_assert((select status from members where id='00000000-0000-4000-8000-000000000003') = 'suspended', 'V4 suspended stays suspended');
update members set status='closed' where id='00000000-0000-4000-8000-000000000003';
update auth.users set email_confirmed_at = null where id='00000000-0000-4000-8000-000000000003';
update auth.users set email_confirmed_at = now() where id='00000000-0000-4000-8000-000000000003';
select t_assert((select status from members where id='00000000-0000-4000-8000-000000000003') = 'closed', 'V4 closed stays closed');
-- V5 confirmed again later does not rewrite the first verification time
select now() as t0 \gset
update auth.users set email_confirmed_at = now() + interval '1 day' where id='00000000-0000-4000-8000-000000000001';
select t_assert((select email_verified_at from members where id='00000000-0000-4000-8000-000000000001') < :'t0'::timestamptz + interval '1 hour', 'V5 later confirmation does not move verified time');
-- V6 normal users cannot call the trigger function or change their own status
set role authenticated;
select t_raises('42501', $q$select public.handle_auth_user_verified()$q$, 'V6 authenticated cannot execute the trigger function');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
select t_raises('42501', $q$update members set status='active' where id='00000000-0000-4000-8000-000000000001'$q$, 'V6 member cannot set own status');
reset role;
-- V7 invalid email on signup still rejected by the existing trigger
select t_raises('GG001', $q$insert into auth.users (id, email) values (gen_random_uuid(), null)$q$, 'V7 null email rejected');
