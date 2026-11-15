-- Proposed changes to AI-1 owned objects (requested in docs/handoffs/ai2-request-to-ai1-db-changes.md). Not applied anywhere.

-- 1. Tie device rows to the token's session id so a revoked device is refused before its token expires.
alter table public.device_sessions add column if not exists session_id uuid;
create unique index if not exists device_sessions_session_id_key on public.device_sessions (session_id) where session_id is not null;
create index if not exists device_sessions_member_active_idx on public.device_sessions (member_id) where revoked_at is null;

-- 2. bootstrap_owner may run only while no owner exists, and only for a real member. Serialised so two calls cannot both pass.
create or replace function public.bootstrap_owner(p_member uuid)
returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  perform pg_advisory_xact_lock(hashtext('gg_bootstrap_owner'));
  if exists (select 1 from member_roles where role = 'owner') then
    raise exception 'an owner already exists' using errcode = 'GG002';
  end if;
  if not exists (select 1 from members where id = p_member) then
    raise exception 'member not found' using errcode = 'GG003';
  end if;
  insert into member_roles (member_id, role, granted_by) values (p_member, 'owner', p_member);
  update members set status = 'active' where id = p_member and status = 'pending_verification';
end;
$$;
