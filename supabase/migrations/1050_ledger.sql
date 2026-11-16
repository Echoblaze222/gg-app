-- 1050: append only ledger. Balance is the sum of entries, never a stored column (D4).

-- Lock anchor, one row per member. Holds no money.
create table ledger_accounts (
  member_id uuid primary key references members (id) on delete restrict,
  currency currency_code not null default 'NGN',
  created_at timestamptz not null default now()
);

create sequence receipt_number_seq as bigint;

create table ledger_entries (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete restrict,
  entry_type ledger_entry_type not null,
  direction ledger_direction not null,
  amount_kobo bigint not null check (amount_kobo > 0 and amount_kobo <= 10000000000),
  currency currency_code not null default 'NGN',
  payment_attempt_id uuid references payment_attempts (id) on delete restrict,
  payout_id uuid references payout_requests (id) on delete restrict,
  refund_id uuid references refunds (id) on delete restrict,
  reason text,
  receipt_number text,
  created_by uuid references members (id),
  created_at timestamptz not null default now(),
  constraint ledger_entries_direction_matches_type check (
    (entry_type in ('contribution_credit', 'payout_reversal_credit', 'adjustment_credit') and direction = 'credit')
    or (entry_type in ('payout_debit', 'refund_debit', 'adjustment_debit') and direction = 'debit')
  ),
  constraint ledger_entries_credit_has_attempt check (entry_type <> 'contribution_credit' or (payment_attempt_id is not null and receipt_number is not null)),
  constraint ledger_entries_payout_has_payout check (entry_type not in ('payout_debit', 'payout_reversal_credit') or payout_id is not null),
  constraint ledger_entries_refund_has_refund check (entry_type <> 'refund_debit' or refund_id is not null),
  constraint ledger_entries_adjustment_has_reason check (entry_type not in ('adjustment_credit', 'adjustment_debit') or (reason is not null and char_length(reason) >= 3))
);
-- Exactly one credit per confirmed payment attempt (I3).
create unique index ledger_entries_one_credit_per_attempt_idx on ledger_entries (payment_attempt_id) where entry_type = 'contribution_credit';
create unique index ledger_entries_one_per_payout_idx on ledger_entries (payout_id, entry_type) where payout_id is not null;
create unique index ledger_entries_one_per_refund_idx on ledger_entries (refund_id, entry_type) where refund_id is not null;
create unique index ledger_entries_receipt_key on ledger_entries (receipt_number) where receipt_number is not null;
create index ledger_entries_member_idx on ledger_entries (member_id, created_at desc, id desc);

-- I1: no update, no delete, no truncate. Second control behind the missing grants.
create function ledger_entries_block_change() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform raise_gg('LEDGER_IMMUTABLE');
  return null;
end;
$$;
create trigger ledger_entries_no_update_delete before update or delete on ledger_entries
  for each row execute function ledger_entries_block_change();
create trigger ledger_entries_no_truncate before truncate on ledger_entries
  for each statement execute function ledger_entries_block_change();
