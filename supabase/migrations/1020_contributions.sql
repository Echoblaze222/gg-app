-- 1020: contribution plans and obligations. Money columns are bigint kobo.
-- 10000000000 kobo is the 100 million naira ceiling from contracts/schemas.ts (MAX_AMOUNT_KOBO).

create table contribution_plans (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete restrict,
  frequency contribution_frequency not null,
  amount_kobo bigint not null check (amount_kobo > 0 and amount_kobo <= 10000000000),
  currency currency_code not null default 'NGN',
  status plan_status not null default 'active',
  starts_on date not null,
  payment_method_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contribution_plans_member_idx on contribution_plans (member_id, created_at desc, id desc);
create index contribution_plans_active_idx on contribution_plans (status) where status = 'active';
create trigger contribution_plans_updated_at before update on contribution_plans for each row execute function set_updated_at();

create table contribution_obligations (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references contribution_plans (id) on delete restrict,
  member_id uuid not null references members (id) on delete restrict,
  due_on date not null,
  amount_kobo bigint not null check (amount_kobo > 0 and amount_kobo <= 10000000000),
  currency currency_code not null default 'NGN',
  status obligation_status not null default 'scheduled',
  paid_by_attempt_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Generation is idempotent: one obligation per plan per due date.
  constraint contribution_obligations_plan_due_key unique (plan_id, due_on),
  constraint contribution_obligations_paid_has_attempt check (status <> 'paid' or paid_by_attempt_id is not null)
);
create index contribution_obligations_member_due_idx on contribution_obligations (member_id, due_on desc, id desc);
create index contribution_obligations_due_scan_idx on contribution_obligations (due_on) where status in ('scheduled', 'due');
create trigger contribution_obligations_updated_at before update on contribution_obligations for each row execute function set_updated_at();
