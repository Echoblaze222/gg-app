-- 1900: row level security, grants, function privileges.
-- Deny by default: anon gets nothing, authenticated gets own rows and a few narrow writes, service_role is the server.
-- RLS is enabled on every table. The table owner and SECURITY DEFINER functions bypass it by design.

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;
grant usage on schema public to authenticated, service_role;

-- Server role ------------------------------------------------------------------
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
-- Append only and never deleted tables (second control behind the triggers).
revoke update, delete, truncate on ledger_entries, audit_logs, security_events from service_role;
revoke delete, truncate on payment_attempts, payout_requests, refunds, payment_events, members from service_role;

-- Member (authenticated) ---------------------------------------------------------
grant select on members, roles, permissions, role_permissions, member_roles, device_sessions,
  contribution_plans, contribution_obligations, payment_attempts, ledger_entries, payout_requests, refunds,
  notifications, announcements, support_tickets, support_messages, policy_versions, policy_acceptances, privacy_requests
  to authenticated;
-- The provider authorization reference is not in this list on purpose (D10).
grant select (id, member_id, brand, last4, exp_month, exp_year, bank, reusable, created_at, revoked_at) on payment_methods to authenticated;
grant update (full_name, phone) on members to authenticated;
grant update (read_at) on notifications to authenticated;
grant insert (member_id, subject) on support_tickets to authenticated;
grant insert (ticket_id, author_id, body) on support_messages to authenticated;
grant insert (member_id, policy_version_id, ip) on policy_acceptances to authenticated;
grant insert (member_id, kind) on privacy_requests to authenticated;

create policy members_select_own on members for select to authenticated using (id = (select auth.uid()));
create policy members_update_own on members for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy roles_select on roles for select to authenticated using (true);
create policy permissions_select on permissions for select to authenticated using (true);
create policy role_permissions_select on role_permissions for select to authenticated using (true);

create policy member_roles_select_own on member_roles for select to authenticated using (member_id = (select auth.uid()));
create policy device_sessions_select_own on device_sessions for select to authenticated using (member_id = (select auth.uid()));
create policy plans_select_own on contribution_plans for select to authenticated using (member_id = (select auth.uid()));
create policy obligations_select_own on contribution_obligations for select to authenticated using (member_id = (select auth.uid()));
create policy payment_methods_select_own on payment_methods for select to authenticated using (member_id = (select auth.uid()));
create policy payment_attempts_select_own on payment_attempts for select to authenticated using (member_id = (select auth.uid()));
create policy ledger_entries_select_own on ledger_entries for select to authenticated using (member_id = (select auth.uid()));
create policy payout_requests_select_own on payout_requests for select to authenticated using (member_id = (select auth.uid()));
create policy refunds_select_own on refunds for select to authenticated using (member_id = (select auth.uid()));

create policy notifications_select_own on notifications for select to authenticated using (member_id = (select auth.uid()));
create policy notifications_update_own on notifications for update to authenticated
  using (member_id = (select auth.uid())) with check (member_id = (select auth.uid()));
create policy announcements_select_published on announcements for select to authenticated
  using (published_at is not null and published_at <= now());

create policy support_tickets_select_own on support_tickets for select to authenticated using (member_id = (select auth.uid()));
create policy support_tickets_insert_own on support_tickets for insert to authenticated with check (member_id = (select auth.uid()));
create policy support_messages_select_own on support_messages for select to authenticated
  using (exists (select 1 from support_tickets t where t.id = ticket_id and t.member_id = (select auth.uid())));
create policy support_messages_insert_own on support_messages for insert to authenticated
  with check (
    author_id = (select auth.uid()) and from_staff = false
    and exists (select 1 from support_tickets t where t.id = ticket_id and t.member_id = (select auth.uid()))
  );

create policy policy_versions_select_published on policy_versions for select to authenticated using (published_at is not null);
create policy policy_acceptances_select_own on policy_acceptances for select to authenticated using (member_id = (select auth.uid()));
create policy policy_acceptances_insert_own on policy_acceptances for insert to authenticated with check (member_id = (select auth.uid()));
create policy privacy_requests_select_own on privacy_requests for select to authenticated using (member_id = (select auth.uid()));
create policy privacy_requests_insert_own on privacy_requests for insert to authenticated with check (member_id = (select auth.uid()));
-- No policies, and no grants, on: payment_events, ledger_accounts, reconciliation_*, security_events,
-- audit_logs, rate_limits, step_up_challenges, app_settings. Only the server role touches them.

-- Safe balance read for the signed in member. The only function authenticated may run.
create function my_balance()
returns table (ledger_kobo bigint, held_kobo bigint, available_kobo bigint)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select * from member_balance((select auth.uid()));
$$;

-- Function privileges: nobody by default, the server role explicitly (D5).
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
grant execute on function my_balance() to authenticated;
