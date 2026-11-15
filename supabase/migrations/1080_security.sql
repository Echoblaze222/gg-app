-- 1080: security events, audit log, rate limits, step up challenges.

create table security_events (
  id uuid primary key default gen_random_uuid(),
  type security_event_type not null,
  severity severity_level not null,
  member_id uuid references members (id) on delete set null,
  ip inet,
  user_agent text,
  request_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index security_events_type_time_idx on security_events (type, created_at desc);
create index security_events_member_idx on security_events (member_id, created_at desc) where member_id is not null;
create index security_events_ip_idx on security_events (ip, type, created_at desc) where ip is not null;

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references members (id) on delete set null,
  action text not null check (char_length(action) between 1 and 120),
  target_type text,
  target_id text,
  result audit_result not null,
  ip inet,
  request_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_actor_idx on audit_logs (actor_id, created_at desc, id desc);
create index audit_logs_target_idx on audit_logs (target_id, created_at desc) where target_id is not null;
create index audit_logs_action_idx on audit_logs (action, created_at desc);

-- Append only, same pattern as the ledger.
create function append_only_block_change() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'append only table' using errcode = 'GG001';
  return null;
end;
$$;
create trigger audit_logs_append_only before update or delete on audit_logs for each row execute function append_only_block_change();
create trigger audit_logs_no_truncate before truncate on audit_logs for each statement execute function append_only_block_change();
create trigger security_events_append_only before update or delete on security_events for each row execute function append_only_block_change();
create trigger security_events_no_truncate before truncate on security_events for each statement execute function append_only_block_change();

create table rate_limits (
  key text not null check (char_length(key) between 1 and 200),
  window_start timestamptz not null,
  window_ends_at timestamptz not null,
  count integer not null default 1 check (count > 0),
  primary key (key, window_start)
);
create index rate_limits_expiry_idx on rate_limits (window_ends_at);

-- Short lived proof for sensitive actions such as a payout OTP. Only a hash is stored (I9).
create table step_up_challenges (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete cascade,
  purpose text not null check (char_length(purpose) between 1 and 60),
  target_id uuid,
  code_hash text not null check (char_length(code_hash) >= 32),
  expires_at timestamptz not null,
  attempts smallint not null default 0 check (attempts >= 0),
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint step_up_challenges_expiry_check check (expires_at > created_at)
);
create index step_up_challenges_lookup_idx on step_up_challenges (member_id, purpose, target_id, created_at desc);
