-- 1120: a new auth user gets a profile, a ledger lock anchor and the member role in one transaction (D12).

create function handle_new_auth_user() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
begin
  if new.email is null then
    raise exception 'email is required' using errcode = 'GG001';
  end if;
  v_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  if v_name is null then
    v_name := split_part(new.email, '@', 1);
  end if;
  if char_length(v_name) < 2 then
    v_name := rpad(v_name, 2, '_');
  end if;
  v_name := left(v_name, 100);

  insert into members (id, email, full_name, email_verified_at)
  values (new.id, new.email, v_name, new.email_confirmed_at);
  insert into ledger_accounts (member_id) values (new.id);
  insert into member_roles (member_id, role) values (new.id, 'member');
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_auth_user();

-- One time owner assignment. The single owner index rejects a second owner.
create function bootstrap_owner(p_member uuid) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into member_roles (member_id, role, granted_by) values (p_member, 'owner', p_member);
  update members set status = 'active' where id = p_member and status = 'pending_verification';
end;
$$;
