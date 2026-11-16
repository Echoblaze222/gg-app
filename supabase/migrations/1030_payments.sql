-- 1030: saved payment methods, payment attempts and raw provider events.
-- Nothing here can hold a card number, CVV or PIN. Only provider tokens and display fields.

create table payment_methods (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete restrict,
  -- Server side only. No SELECT grant for authenticated (see 1900).
  provider_authorization_ref text not null,
  provider_card_signature text not null,
  brand text,
  last4 text check (last4 is null or last4 ~ '^\d{4}$'),
  exp_month smallint check (exp_month is null or exp_month between 1 and 12),
  exp_year smallint check (exp_year is null or exp_year between 2000 and 2200),
  bank text,
  reusable boolean not null default false,
  authorization_email citext not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  -- The same card is saved once per member.
  constraint payment_methods_member_signature_key unique (member_id, provider_card_signature)
);
create index payment_methods_member_idx on payment_methods (member_id, created_at desc);

alter table contribution_plans
  add constraint contribution_plans_payment_method_fk foreign key (payment_method_id) references payment_methods (id) on delete set null;

create table payment_attempts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete restrict,
  purpose payment_purpose not null,
  channel payment_channel,
  amount_kobo bigint not null check (amount_kobo > 0 and amount_kobo <= 10000000000),
  currency currency_code not null default 'NGN',
  status payment_attempt_status not null default 'initiating',
  reference text not null check (char_length(reference) between 8 and 100),
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 64),
  obligation_id uuid references contribution_obligations (id) on delete set null,
  payment_method_id uuid references payment_methods (id) on delete set null,
  provider_transaction_id text,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint payment_attempts_reference_key unique (reference),
  constraint payment_attempts_member_idempotency_key unique (member_id, idempotency_key),
  constraint payment_attempts_completed_check check (
    (status in ('successful', 'failed', 'cancelled', 'expired', 'reversed')) = (completed_at is not null)
    or status = 'reversed'
  )
);
create index payment_attempts_member_idx on payment_attempts (member_id, created_at desc, id desc);
create index payment_attempts_status_idx on payment_attempts (status, updated_at) where status in ('initiating', 'awaiting_authentication', 'processing', 'verifying');
create unique index payment_attempts_provider_txn_key on payment_attempts (provider_transaction_id) where provider_transaction_id is not null;
create trigger payment_attempts_updated_at before update on payment_attempts for each row execute function set_updated_at();

alter table contribution_obligations
  add constraint contribution_obligations_attempt_fk foreign key (paid_by_attempt_id) references payment_attempts (id) on delete restrict;

create table payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'paystack' check (provider = 'paystack'),
  provider_event_id text not null check (char_length(provider_event_id) between 1 and 200),
  event_type text not null,
  raw_payload jsonb not null,
  signature_valid boolean not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text,
  attempt_id uuid references payment_attempts (id) on delete set null,
  -- A duplicate webhook cannot be stored twice (I4).
  constraint payment_events_provider_event_key unique (provider, provider_event_id)
);
create index payment_events_unprocessed_idx on payment_events (received_at, id) where processed_at is null;
