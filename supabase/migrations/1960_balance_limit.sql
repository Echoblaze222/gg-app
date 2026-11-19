-- 1960: savings cap per member, and the permission to change money limits. See ADR-014.
-- Why: the platform starts with students, so no member may hold a large balance. The cap is configuration the
-- owner raises over time, and the database enforces it so no client or service bug can exceed it.
-- Runs after the 1950 seed so it can add to the permissions and settings seeded there.

insert into permissions (name, description) values
  ('admin.limits.update', 'Change the money limits in app_settings: savings cap, contribution and payout limits.');

-- Owner only by default. Role defaults mirror contracts/permissions.ts, and a test keeps the two in sync.
insert into role_permissions (role, permission) values ('owner', 'admin.limits.update');

insert into app_settings (key, value, description) values
  ('member.balance.max_kobo', '50000000',
   'Most a member may hold in savings at once, in kobo (500,000 naira). Low on purpose for students. Raise it as the platform matures.');

-- A single contribution can never be larger than the savings cap.
update app_settings
   set value = '50000000',
       description = 'Largest single contribution in kobo (500,000 naira). Keep it at or below member.balance.max_kobo.'
 where key = 'contribution.max_kobo';

-- Refuses a contribution attempt that would take the member above the cap.
-- Counts: money already in the ledger, plus contribution attempts still in flight, plus this attempt.
-- Not counted: card_authorization attempts (they verify a card, they do not add savings).
-- Takes the same row lock as ledger_post, so two simultaneous attempts cannot both slip under the cap.
-- A missing or unreadable cap blocks the attempt: no limit is never the safe default.
create function payment_attempts_balance_limit() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_raw text;
  v_cap bigint;
  v_total bigint;
begin
  if new.purpose not in ('scheduled_contribution', 'one_time_contribution') then
    return new;
  end if;
  -- Out of range amounts are left for the table's own CHECK constraint to reject with its usual error.
  if new.amount_kobo is null or new.amount_kobo <= 0 or new.amount_kobo > 10000000000 then
    return new;
  end if;

  perform 1 from ledger_accounts where member_id = new.member_id for update;
  if not found then
    perform raise_gg('NOT_FOUND');
  end if;

  select value into v_raw from app_settings where key = 'member.balance.max_kobo';
  if v_raw is null or v_raw !~ '^[0-9]{1,15}$' then
    raise exception '%', 'PAYMENT_AMOUNT_INVALID' using errcode = 'GG001', detail = 'member_balance_limit_not_configured';
  end if;
  v_cap := v_raw::bigint;

  select member_ledger_balance(new.member_id) + coalesce(sum(amount_kobo), 0) + new.amount_kobo
    into v_total
    from payment_attempts
   where member_id = new.member_id
     and purpose in ('scheduled_contribution', 'one_time_contribution')
     and status in ('initiating', 'awaiting_authentication', 'processing', 'verifying');

  if v_total > v_cap then
    raise exception '%', 'PAYMENT_AMOUNT_INVALID' using errcode = 'GG001', detail = 'member_balance_limit';
  end if;
  return new;
end;
$$;

-- Created after migration 1900, so it must close its own execute rights (a trigger needs none).
revoke all on function payment_attempts_balance_limit() from public, anon, authenticated;

create trigger payment_attempts_balance_limit before insert on payment_attempts
  for each row execute function payment_attempts_balance_limit();
