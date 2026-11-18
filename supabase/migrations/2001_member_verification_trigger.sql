-- AI-2: activate a member when the identity provider has verified their email.
-- Why: handle_new_auth_user (AI-1) creates members as pending_verification, and nothing else moves a normal
-- member to active, so every sign in would be refused with AUTH_EMAIL_NOT_VERIFIED.
-- Covers email links (UPDATE of email_confirmed_at) and providers that create already verified users (INSERT, Google).
-- Never touches suspended or closed members.

create or replace function public.handle_auth_user_verified()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.email_confirmed_at is not null and (tg_op = 'INSERT' or old.email_confirmed_at is null) then
    update public.members
       set email_verified_at = new.email_confirmed_at,
           status = case when status = 'pending_verification' then 'active'::member_status else status end
     where id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.handle_auth_user_verified() from public, anon, authenticated;

-- Name sorts after on_auth_user_created, so on INSERT the members row already exists when this runs.
drop trigger if exists on_auth_user_created_activate on auth.users;
create trigger on_auth_user_created_activate
  after insert on auth.users
  for each row execute function public.handle_auth_user_verified();

drop trigger if exists on_auth_user_verified on auth.users;
create trigger on_auth_user_verified
  after update of email_confirmed_at on auth.users
  for each row execute function public.handle_auth_user_verified();
