-- 1971: a reversed payment takes its money back out of the ledger (ADR-015).
-- Before this, `successful` to `reversed` left the credit in the ledger, so a member could withdraw money the
-- provider had already clawed back.
--
-- Rules
--   * When an attempt becomes `reversed`, one `payment_reversal_debit` is posted for it. One per attempt, never two.
--   * The balance never goes negative (I2). The debit takes what the member still has, up to the payment amount.
--     Money in a payout that is already `processing` has left, so it is not taken back.
--   * Whatever could not be taken back is recorded as a shortfall (payment_shortfalls), owed by the member.
--   * While a shortfall is open the member cannot start or advance a payout. The owner resolves it with a note.
--   * A payout can no longer be approved or sent unless the ledger still covers it.

-- 1. Ledger rules ----------------------------------------------------------------------------------------------
alter table ledger_entries drop constraint ledger_entries_direction_matches_type;
alter table ledger_entries add constraint ledger_entries_direction_matches_type check (
  (entry_type in ('contribution_credit', 'payout_reversal_credit', 'adjustment_credit') and direction = 'credit')
  or (entry_type in ('payout_debit', 'refund_debit', 'adjustment_debit', 'payment_reversal_debit') and direction = 'debit')
);
alter table ledger_entries add constraint ledger_entries_reversal_has_attempt check (
  entry_type <> 'payment_reversal_debit' or payment_attempt_id is not null
);
-- Exactly one reversal debit per payment attempt.
create unique index ledger_entries_one_reversal_per_attempt_idx on ledger_entries (payment_attempt_id)
  where entry_type = 'payment_reversal_debit';

-- 2. Shortfalls: money the provider took back that the member had already spent -------------------------------
create table payment_shortfalls (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete restrict,
  payment_attempt_id uuid not null unique references payment_attempts (id) on delete restrict,
  amount_kobo bigint not null check (amount_kobo > 0 and amount_kobo <= 10000000000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references members (id),
  resolution text check (resolution in ('forgiven', 'repaid')),
  resolution_note text,
  constraint payment_shortfalls_resolution_complete check (
    (resolved_at is null and resolution is null and resolved_by is null and resolution_note is null)
    or (resolved_at is not null and resolution is not null and resolved_by is not null and char_length(resolution_note) >= 3)
  )
);
create index payment_shortfalls_open_idx on payment_shortfalls (member_id) where resolved_at is null;

alter table payment_shortfalls enable row level security;
revoke all on payment_shortfalls from public, anon, authenticated;
-- Server only, and never deleted (second control behind the missing policies).
revoke delete, truncate on payment_shortfalls from service_role;

-- A shortfall can only be resolved, never edited or removed.
create function payment_shortfalls_guard() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform raise_gg('CONFLICT');
  end if;
  if old.resolved_at is not null
     or new.id <> old.id or new.member_id <> old.member_id or new.payment_attempt_id <> old.payment_attempt_id
     or new.amount_kobo <> old.amount_kobo or new.created_at <> old.created_at then
    perform raise_gg('CONFLICT');
  end if;
  return new;
end;
$$;
create trigger payment_shortfalls_guard before update or delete on payment_shortfalls
  for each row execute function payment_shortfalls_guard();

-- 3. Taking the money back ---------------------------------------------------------------------------------------
-- Idempotent: running it again for the same attempt changes nothing. Called by the trigger below, and safe to call
-- from the reconciliation job.
create function ledger_reverse_payment(p_attempt uuid)
returns table (entry_id uuid, debited_kobo bigint, shortfall_kobo bigint, created boolean)
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  a payment_attempts%rowtype;
  v_entry uuid;
  v_debited bigint;
  v_short bigint;
  v_reversible bigint;
begin
  select * into a from payment_attempts where id = p_attempt;
  if not found or a.status <> 'reversed' then
    perform raise_gg('CONFLICT');
  end if;

  -- Same member lock as every other money change.
  perform 1 from ledger_accounts where member_id = a.member_id for update;
  if not found then
    perform raise_gg('NOT_FOUND');
  end if;

  -- Already handled: either the debit exists, or the whole amount was recorded as a shortfall.
  select id, amount_kobo into v_entry, v_debited
    from ledger_entries where payment_attempt_id = p_attempt and entry_type = 'payment_reversal_debit';
  if found then
    select coalesce(max(s.amount_kobo), 0) into v_short from payment_shortfalls s where s.payment_attempt_id = p_attempt;
    return query select v_entry, v_debited, v_short, false;
    return;
  end if;
  select s.amount_kobo into v_short from payment_shortfalls s where s.payment_attempt_id = p_attempt;
  if found then
    return query select null::uuid, 0::bigint, v_short, false;
    return;
  end if;

  -- Only a payment that was actually credited can be taken back.
  if not exists (select 1 from ledger_entries where payment_attempt_id = p_attempt and entry_type = 'contribution_credit') then
    perform raise_gg('CONFLICT');
  end if;

  -- Money in a payout that is already processing has left the platform, so it cannot be taken back.
  v_reversible := greatest(
    member_ledger_balance(a.member_id)
      - coalesce((select sum(amount_kobo) from payout_requests where member_id = a.member_id and status = 'processing'), 0),
    0
  );
  v_debited := least(a.amount_kobo, v_reversible);
  v_short := a.amount_kobo - v_debited;

  if v_debited > 0 then
    insert into ledger_entries (member_id, entry_type, direction, amount_kobo, payment_attempt_id, reason)
    values (a.member_id, 'payment_reversal_debit', 'debit', v_debited, p_attempt, 'Payment reversed by the provider')
    returning id into v_entry;
  end if;
  if v_short > 0 then
    insert into payment_shortfalls (member_id, payment_attempt_id, amount_kobo) values (a.member_id, p_attempt, v_short);
  end if;

  return query select v_entry, v_debited, v_short, true;
end;
$$;

create function payment_attempts_after_reversal() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform ledger_reverse_payment(new.id);
  return null;
end;
$$;
create trigger payment_attempts_reversal_debit after update of status on payment_attempts
  for each row when (new.status = 'reversed' and old.status <> 'reversed')
  execute function payment_attempts_after_reversal();

-- 4. The owner resolves a shortfall (forgiven, or repaid outside the platform) ----------------------------------
-- The permission is checked here, in the database, so no caller can skip it.
create function payment_shortfall_resolve(p_id uuid, p_by uuid, p_resolution text, p_note text)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not has_permission(p_by, 'admin.ledger.adjust') then
    perform raise_gg('PERMISSION_DENIED');
  end if;
  if p_resolution not in ('forgiven', 'repaid') or p_note is null or char_length(p_note) < 3 then
    perform raise_gg('VALIDATION_FAILED');
  end if;
  update payment_shortfalls
     set resolved_at = now(), resolved_by = p_by, resolution = p_resolution, resolution_note = p_note
   where id = p_id and resolved_at is null;
  if not found then
    perform raise_gg('NOT_FOUND');
  end if;
end;
$$;

-- 5. Payout guard: no new or advancing payout while money is owed, and never one the ledger cannot cover -------
create function payout_requests_funding_guard() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and not (new.status <> old.status and new.status in ('approved', 'processing')) then
    return new;
  end if;
  -- Serialise with reversals and every other money change for this member.
  perform 1 from ledger_accounts where member_id = new.member_id for update;
  if exists (select 1 from payment_shortfalls where member_id = new.member_id and resolved_at is null) then
    perform raise_gg('PAYOUT_NOT_ELIGIBLE');
  end if;
  if tg_op = 'UPDATE' and member_ledger_balance(new.member_id) < new.amount_kobo then
    perform raise_gg('PAYOUT_INSUFFICIENT_BALANCE');
  end if;
  return new;
end;
$$;
create trigger payout_requests_funding_guard before insert or update on payout_requests
  for each row execute function payout_requests_funding_guard();

-- Created after migration 1900, so close the execute rights here (triggers need none).
revoke all on function payment_shortfalls_guard() from public, anon, authenticated;
revoke all on function ledger_reverse_payment(uuid) from public, anon, authenticated;
revoke all on function payment_attempts_after_reversal() from public, anon, authenticated;
revoke all on function payment_shortfall_resolve(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function payout_requests_funding_guard() from public, anon, authenticated;
