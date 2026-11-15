-- 1110: balance functions and the atomic money functions (D5, D6, D7).
-- Every function below is SECURITY DEFINER with a pinned search_path and is executable by service_role only (see 1900).

create function member_ledger_balance(p_member uuid) returns bigint
language sql stable
set search_path = public, pg_temp
as $$
  select coalesce(sum(case direction when 'credit' then amount_kobo else -amount_kobo end), 0)::bigint
  from ledger_entries where member_id = p_member;
$$;

create function member_held(p_member uuid) returns bigint
language sql stable
set search_path = public, pg_temp
as $$
  select coalesce(sum(amount_kobo), 0)::bigint
  from payout_requests
  where member_id = p_member and status in ('requested', 'verified', 'approved', 'processing');
$$;

-- I7: one definition of available balance, used everywhere.
create function member_available(p_member uuid) returns bigint
language sql stable
set search_path = public, pg_temp
as $$
  select member_ledger_balance(p_member) - member_held(p_member);
$$;

create function member_balance(p_member uuid)
returns table (ledger_kobo bigint, held_kobo bigint, available_kobo bigint)
language sql stable
set search_path = public, pg_temp
as $$
  select l.l, h.h, l.l - h.h
  from (select member_ledger_balance(p_member) as l) l, (select member_held(p_member) as h) h;
$$;

create function has_permission(p_member uuid, p_permission text) returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from member_roles mr
    join role_permissions rp on rp.role = mr.role
    join members m on m.id = mr.member_id
    where mr.member_id = p_member and rp.permission = p_permission and m.status = 'active'
  );
$$;

-- Appends one ledger entry (D5). Idempotent for credits per attempt, debits per payout and refund.
create function ledger_post(
  p_member uuid,
  p_type ledger_entry_type,
  p_amount bigint,
  p_attempt uuid default null,
  p_payout uuid default null,
  p_refund uuid default null,
  p_reason text default null,
  p_created_by uuid default null
) returns table (entry_id uuid, created boolean)
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_existing uuid;
  v_new uuid;
  v_dir ledger_direction;
  v_receipt text;
  a payment_attempts%rowtype;
  p payout_requests%rowtype;
  r refunds%rowtype;
begin
  if p_amount is null or p_amount <= 0 then
    perform raise_gg('PAYMENT_AMOUNT_INVALID');
  end if;

  -- Serialise every money change for this member.
  perform 1 from ledger_accounts where member_id = p_member for update;
  if not found then
    perform raise_gg('NOT_FOUND');
  end if;

  v_dir := case when p_type in ('contribution_credit', 'payout_reversal_credit', 'adjustment_credit') then 'credit' else 'debit' end;

  if p_type = 'contribution_credit' then
    select * into a from payment_attempts where id = p_attempt;
    if not found or a.member_id <> p_member or a.amount_kobo <> p_amount or a.status <> 'successful' then
      perform raise_gg('CONFLICT');
    end if;
    select id into v_existing from ledger_entries where payment_attempt_id = p_attempt and entry_type = 'contribution_credit';
    if found then
      return query select v_existing, false;
      return;
    end if;
    v_receipt := 'GGR-' || to_char(now() at time zone 'Africa/Lagos', 'YYMMDD') || '-' || lpad(nextval('receipt_number_seq')::text, 6, '0');
  elsif p_type in ('payout_debit', 'payout_reversal_credit') then
    select * into p from payout_requests where id = p_payout;
    if not found or p.member_id <> p_member or p.amount_kobo <> p_amount then
      perform raise_gg('CONFLICT');
    end if;
    select id into v_existing from ledger_entries where payout_id = p_payout and entry_type = p_type;
    if found then
      return query select v_existing, false;
      return;
    end if;
    -- The payout debit is the money leaving, so the whole ledger balance (which includes the held amount) is the limit.
    if p_type = 'payout_debit' and member_ledger_balance(p_member) < p_amount then
      perform raise_gg('LEDGER_NEGATIVE_BALANCE');
    end if;
  elsif p_type = 'refund_debit' then
    select * into r from refunds where id = p_refund;
    if not found or r.member_id <> p_member or r.amount_kobo <> p_amount then
      perform raise_gg('CONFLICT');
    end if;
    select id into v_existing from ledger_entries where refund_id = p_refund and entry_type = 'refund_debit';
    if found then
      return query select v_existing, false;
      return;
    end if;
    if member_available(p_member) < p_amount then
      perform raise_gg('LEDGER_NEGATIVE_BALANCE');
    end if;
  elsif p_type = 'adjustment_debit' then
    if member_available(p_member) < p_amount then
      perform raise_gg('LEDGER_NEGATIVE_BALANCE');
    end if;
  end if;

  insert into ledger_entries (member_id, entry_type, direction, amount_kobo, payment_attempt_id, payout_id, refund_id, reason, receipt_number, created_by)
  values (p_member, p_type, v_dir, p_amount, p_attempt, p_payout, p_refund, p_reason, v_receipt, p_created_by)
  returning id into v_new;

  return query select v_new, true;
end;
$$;

-- A successful payment attempt always carries exactly one credit (I3).
create function payment_attempts_after_success() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  o contribution_obligations%rowtype;
begin
  perform ledger_post(new.member_id, 'contribution_credit', new.amount_kobo, new.id);
  if new.obligation_id is not null then
    select * into o from contribution_obligations where id = new.obligation_id for update;
    if found and o.status in ('scheduled', 'due', 'missed') then
      if o.status = 'scheduled' then
        update contribution_obligations set status = 'due' where id = o.id;
      end if;
      update contribution_obligations set status = 'paid', paid_by_attempt_id = new.id where id = o.id;
    end if;
  end if;
  return null;
end;
$$;
create trigger payment_attempts_success_credit after update of status on payment_attempts
  for each row when (new.status = 'successful' and old.status <> 'successful')
  execute function payment_attempts_after_success();

-- A paid payout always carries exactly one debit (D6).
create function payout_requests_after_paid() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform ledger_post(new.member_id, 'payout_debit', new.amount_kobo, null, new.id);
  return null;
end;
$$;
create trigger payout_requests_paid_debit after update of status on payout_requests
  for each row when (new.status = 'paid' and old.status <> 'paid')
  execute function payout_requests_after_paid();

-- A completed refund always carries exactly one debit (D7).
create function refunds_after_completed() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform ledger_post(new.member_id, 'refund_debit', new.amount_kobo, new.payment_attempt_id, null, new.id);
  return null;
end;
$$;
create trigger refunds_completed_debit after update of status on refunds
  for each row when (new.status = 'completed' and old.status <> 'completed')
  execute function refunds_after_completed();

-- Creates a payout request atomically (I6, I7).
create function payout_create(
  p_member uuid,
  p_amount bigint,
  p_bank_code text,
  p_bank_name text,
  p_account_number text,
  p_account_name text default null
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_status member_status;
  v_id uuid;
begin
  perform 1 from ledger_accounts where member_id = p_member for update;
  if not found then
    perform raise_gg('NOT_FOUND');
  end if;
  select status into v_status from members where id = p_member;
  if v_status <> 'active' then
    perform raise_gg('PAYOUT_NOT_ELIGIBLE');
  end if;
  if p_amount is null or p_amount <= 0 then
    perform raise_gg('PAYMENT_AMOUNT_INVALID');
  end if;
  if exists (select 1 from payout_requests where member_id = p_member and status in ('requested', 'verified', 'approved', 'processing')) then
    perform raise_gg('PAYOUT_ALREADY_OPEN');
  end if;
  if member_available(p_member) < p_amount then
    perform raise_gg('PAYOUT_INSUFFICIENT_BALANCE');
  end if;
  insert into payout_requests (member_id, amount_kobo, destination_bank_code, destination_bank_name, destination_account_number, destination_account_name)
  values (p_member, p_amount, p_bank_code, p_bank_name, p_account_number, p_account_name)
  returning id into v_id;
  return v_id;
exception
  when unique_violation then
    perform raise_gg('PAYOUT_ALREADY_OPEN');
    return null;
end;
$$;
