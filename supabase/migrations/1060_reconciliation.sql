-- 1060: reconciliation runs and records.

create table reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table reconciliation_records (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references reconciliation_runs (id) on delete restrict,
  payment_attempt_id uuid references payment_attempts (id) on delete set null,
  provider_reference text,
  status reconciliation_status not null default 'open',
  expected_kobo bigint check (expected_kobo is null or expected_kobo >= 0),
  provider_kobo bigint check (provider_kobo is null or provider_kobo >= 0),
  note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references members (id),
  constraint reconciliation_resolved_has_actor check (status <> 'resolved' or (resolved_at is not null and resolved_by is not null))
);
create index reconciliation_records_open_idx on reconciliation_records (created_at, id) where status in ('open', 'discrepancy');
create index reconciliation_records_run_idx on reconciliation_records (run_id);
