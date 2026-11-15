-- Minimal local stand in for the Supabase pieces the migrations touch. Mirrors the remote definitions read on 2026-11-15.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create extension if not exists citext;
create schema if not exists auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}'::jsonb);
create type member_status as enum ('pending_verification','active','suspended','closed');
create type member_role as enum ('owner','admin','support','member');
create table members (id uuid primary key, email citext not null, phone text, full_name text not null, status member_status not null default 'pending_verification', email_verified_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now());
create table member_roles (member_id uuid references members(id), role member_role not null, granted_by uuid, primary key (member_id, role));
create table ledger_accounts (member_id uuid primary key references members(id));
create table device_sessions (id uuid primary key default gen_random_uuid(), member_id uuid not null references members(id), device_label text, ip inet, user_agent text, created_at timestamptz default now(), last_seen_at timestamptz default now(), revoked_at timestamptz);
alter table members enable row level security;
grant select on members to authenticated;
grant update (full_name, phone) on members to authenticated;
create policy members_update_own on members for update to authenticated using (id = nullif(current_setting('request.jwt.claim.sub', true), '')::uuid) with check (id = nullif(current_setting('request.jwt.claim.sub', true), '')::uuid);
create policy members_select_own on members for select to authenticated using (id = nullif(current_setting('request.jwt.claim.sub', true), '')::uuid);

create or replace function public.handle_new_auth_user() returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $f$
declare v_name text;
begin
  if new.email is null then raise exception 'email is required' using errcode = 'GG001'; end if;
  v_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  if v_name is null then v_name := split_part(new.email, '@', 1); end if;
  if char_length(v_name) < 2 then v_name := rpad(v_name, 2, '_'); end if;
  v_name := left(v_name, 100);
  insert into members (id, email, full_name, email_verified_at) values (new.id, new.email, v_name, new.email_confirmed_at);
  insert into ledger_accounts (member_id) values (new.id);
  insert into member_roles (member_id, role) values (new.id, 'member');
  return new;
end; $f$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_auth_user();

create or replace function public.bootstrap_owner(p_member uuid) returns void language plpgsql security definer set search_path to 'public','pg_temp' as $f$
begin
  insert into member_roles (member_id, role, granted_by) values (p_member, 'owner', p_member);
  update members set status = 'active' where id = p_member and status = 'pending_verification';
end; $f$;
revoke all on function public.bootstrap_owner(uuid) from public, anon, authenticated;
grant execute on function public.bootstrap_owner(uuid) to service_role;
