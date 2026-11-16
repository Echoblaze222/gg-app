-- 1040: payout (withdrawal) requests and refunds.

create table payout_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete restrict,
  amount_kobo bigint not null check (amount_kobo > 0 and amount_kobo <= 10000000000),
  currency currency_code not null default 'NGN',
  status payout_status not null default 'requested',
  -- Destination is copied here at request time. It is immutable (see 1100).
  destination_bank_code text not null check (destination_bank_code ~ '^\d{3,6}$'),
  destination_bank_name text not null check (char_length(destination_bank_name) between 1 and 120),
  destination_account_number text not null check (destination_account_number ~ '^\d{10}$'),
  destination_account_name text,
  verified_at timestamptz,
  decided_by uuid references members (id),
  decided_at timestamptz,
  decision_note text,
  provider_transfer_ref text,
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint payout_requests_paid_has_transfer_ref check (status <> 'paid' or provider_transfer_ref is not null),
  constraint payout_requests_rejected_has_note check (status <> 'rejected' or decision_note is not null)
);
-- At most one open payout per member (I6).
create unique index payout_requests_one_open_idx on payout_requests (member_id)
  where status in ('requested', 'verified', 'approved', 'processing');
create unique index payout_requests_transfer_ref_key on payout_requests (provider_transfer_ref) where provider_transfer_ref is not null;
create index payout_requests_member_idx on payout_requests (member_id, requested_at desc, id desc);
create index payout_requests_status_idx on payout_requests (status, requested_at, id);
create trigger payout_requests_updated_at before update on payout_requests for each row execute function set_updated_at();

create table refunds (
  id uuid primary key default gen_random_uuid(),
  payment_attempt_id uuid not null references payment_attempts (id) on delete restrict,
  member_id uuid not null references members (id) on delete restrict,
  amount_kobo bigint not null check (amount_kobo > 0 and amount_kobo <= 10000000000),
  currency currency_code not null default 'NGN',
  status refund_status not null default 'requested',
  reason text not null check (char_length(reason) between 3 and 1000),
  requested_by uuid not null references members (id),
  decided_by uuid references members (id),
  provider_refund_ref text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint refunds_completed_has_ref check (status <> 'completed' or provider_refund_ref is not null)
);
create unique index refunds_provider_ref_key on refunds (provider_refund_ref) where provider_refund_ref is not null;
create index refunds_attempt_idx on refunds (payment_attempt_id);
create index refunds_member_idx on refunds (member_id, created_at desc, id desc);
create index refunds_status_idx on refunds (status, created_at, id);
create trigger refunds_updated_at before update on refunds for each row execute function set_updated_at();
