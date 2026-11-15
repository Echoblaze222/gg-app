-- 1090: policies, acceptances, privacy requests, system settings.

create table policy_versions (
  id uuid primary key default gen_random_uuid(),
  kind policy_kind not null,
  version text not null check (char_length(version) between 1 and 40),
  body text not null,
  -- True until a qualified Nigerian legal review signs it off.
  draft boolean not null default true,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  constraint policy_versions_kind_version_key unique (kind, version)
);
create index policy_versions_latest_idx on policy_versions (kind, published_at desc) where published_at is not null;

create table policy_acceptances (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete cascade,
  policy_version_id uuid not null references policy_versions (id) on delete restrict,
  accepted_at timestamptz not null default now(),
  ip inet,
  constraint policy_acceptances_member_version_key unique (member_id, policy_version_id)
);

create table privacy_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete cascade,
  kind privacy_request_kind not null,
  status privacy_request_status not null default 'received',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index privacy_requests_member_idx on privacy_requests (member_id, created_at desc);
create index privacy_requests_open_idx on privacy_requests (created_at, id) where status in ('received', 'in_review');

create table app_settings (
  key text primary key check (key ~ '^[a-z0-9_.]+$'),
  value text not null,
  description text,
  updated_by uuid references members (id),
  updated_at timestamptz not null default now()
);
create trigger app_settings_updated_at before update on app_settings for each row execute function set_updated_at();
