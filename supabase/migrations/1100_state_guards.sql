-- 1100: state machine and immutability guards (D8). Tables mirror contracts/state-machines.ts.
-- A test walks every (from, to) pair from the contract and compares the outcome with these functions.

create function payment_attempt_transition_ok(f payment_attempt_status, t payment_attempt_status) returns boolean
language sql immutable
set search_path = public, pg_temp
as $$
  select case f
    when 'initiating' then t in ('awaiting_authentication', 'processing', 'failed', 'cancelled', 'expired')
    when 'awaiting_authentication' then t in ('processing', 'failed', 'cancelled', 'expired')
    when 'processing' then t in ('verifying', 'failed', 'expired')
    when 'verifying' then t in ('successful', 'failed', 'processing')
    when 'successful' then t in ('reversed')
    else false
  end;
$$;

create function payout_transition_ok(f payout_status, t payout_status) returns boolean
language sql immutable
set search_path = public, pg_temp
as $$
  select case f
    when 'requested' then t in ('verified', 'rejected', 'cancelled')
    when 'verified' then t in ('approved', 'rejected', 'cancelled')
    when 'approved' then t in ('processing', 'rejected', 'cancelled')
    when 'processing' then t in ('paid', 'failed')
    else false
  end;
$$;

create function obligation_transition_ok(f obligation_status, t obligation_status) returns boolean
language sql immutable
set search_path = public, pg_temp
as $$
  select case f
    when 'scheduled' then t in ('due', 'cancelled')
    when 'due' then t in ('paid', 'missed', 'cancelled')
    when 'missed' then t in ('paid', 'cancelled')
    else false
  end;
$$;

create function refund_transition_ok(f refund_status, t refund_status) returns boolean
language sql immutable
set search_path = public, pg_temp
as $$
  select case f
    when 'requested' then t in ('approved', 'rejected')
    when 'approved' then t in ('processing', 'rejected')
    when 'processing' then t in ('completed', 'failed')
    else false
  end;
$$;

-- Payment attempts ------------------------------------------------------------
create function payment_attempts_guard() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.id <> old.id or new.member_id <> old.member_id or new.purpose <> old.purpose
     or new.amount_kobo <> old.amount_kobo or new.currency <> old.currency
     or new.reference <> old.reference or new.idempotency_key <> old.idempotency_key
     or new.created_at <> old.created_at then
    perform raise_gg('CONFLICT');
  end if;
  if new.status <> old.status then
    if not payment_attempt_transition_ok(old.status, new.status) then
      perform raise_gg('CONFLICT');
    end if;
    if new.status in ('successful', 'failed', 'cancelled', 'expired') and new.completed_at is null then
      new.completed_at := now();
    end if;
  end if;
  return new;
end;
$$;
create trigger payment_attempts_guard before update on payment_attempts for each row execute function payment_attempts_guard();

-- Payouts ---------------------------------------------------------------------
create function payout_requests_guard() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.id <> old.id or new.member_id <> old.member_id or new.amount_kobo <> old.amount_kobo
     or new.currency <> old.currency or new.requested_at <> old.requested_at
     or new.destination_bank_code <> old.destination_bank_code
     or new.destination_bank_name <> old.destination_bank_name
     or new.destination_account_number <> old.destination_account_number
     or new.destination_account_name is distinct from old.destination_account_name then
    perform raise_gg('CONFLICT');
  end if;
  if new.status <> old.status then
    if not payout_transition_ok(old.status, new.status) then
      perform raise_gg('PAYOUT_TRANSITION_INVALID');
    end if;
    if new.status = 'verified' and new.verified_at is null then new.verified_at := now(); end if;
    if new.status in ('approved', 'rejected') and new.decided_at is null then new.decided_at := now(); end if;
    if new.status in ('paid', 'rejected', 'failed', 'cancelled') and new.resolved_at is null then new.resolved_at := now(); end if;
  end if;
  return new;
end;
$$;
create trigger payout_requests_guard before update on payout_requests for each row execute function payout_requests_guard();

-- Obligations -----------------------------------------------------------------
create function contribution_obligations_guard() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.id <> old.id or new.plan_id <> old.plan_id or new.member_id <> old.member_id
     or new.due_on <> old.due_on or new.amount_kobo <> old.amount_kobo or new.currency <> old.currency then
    perform raise_gg('CONFLICT');
  end if;
  if new.status <> old.status and not obligation_transition_ok(old.status, new.status) then
    perform raise_gg('CONFLICT');
  end if;
  return new;
end;
$$;
create trigger contribution_obligations_guard before update on contribution_obligations for each row execute function contribution_obligations_guard();

-- Plans: owner never changes -----------------------------------------------------
create function contribution_plans_guard() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.id <> old.id or new.member_id <> old.member_id or new.frequency <> old.frequency or new.starts_on <> old.starts_on then
    perform raise_gg('CONFLICT');
  end if;
  if old.status = 'cancelled' and new.status <> 'cancelled' then
    perform raise_gg('PLAN_NOT_ACTIVE');
  end if;
  return new;
end;
$$;
create trigger contribution_plans_guard before update on contribution_plans for each row execute function contribution_plans_guard();

-- Refunds ---------------------------------------------------------------------
create function refunds_guard_insert() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  a payment_attempts%rowtype;
  already bigint;
begin
  select * into a from payment_attempts where id = new.payment_attempt_id for share;
  if not found or a.member_id <> new.member_id or a.status <> 'successful' then
    perform raise_gg('CONFLICT');
  end if;
  select coalesce(sum(amount_kobo), 0) into already
    from refunds where payment_attempt_id = new.payment_attempt_id and status not in ('rejected', 'failed');
  if already + new.amount_kobo > a.amount_kobo then
    perform raise_gg('PAYMENT_AMOUNT_INVALID');
  end if;
  return new;
end;
$$;
create trigger refunds_guard_insert before insert on refunds for each row execute function refunds_guard_insert();

create function refunds_guard_update() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.id <> old.id or new.payment_attempt_id <> old.payment_attempt_id or new.member_id <> old.member_id
     or new.amount_kobo <> old.amount_kobo or new.currency <> old.currency or new.requested_by <> old.requested_by then
    perform raise_gg('CONFLICT');
  end if;
  if new.status <> old.status then
    if not refund_transition_ok(old.status, new.status) then
      perform raise_gg('CONFLICT');
    end if;
    if new.status in ('completed', 'rejected', 'failed') and new.resolved_at is null then
      new.resolved_at := now();
    end if;
  end if;
  return new;
end;
$$;
create trigger refunds_guard_update before update on refunds for each row execute function refunds_guard_update();
