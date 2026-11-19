-- 1010: identity and RBAC.

create table members (
  id uuid primary key references auth.users (id) on delete restrict,
  email citext not null unique,
  phone text unique,
  full_name text not null check (char_length(full_name) between 2 and 100),
  status member_status not null default 'pending_verification',
  email_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index members_status_created_idx on members (status, created_at desc, id desc);
create index members_lower_name_idx on members (lower(full_name));
create trigger members_updated_at before update on members for each row execute function set_updated_at();

create table roles (
  name role_name primary key,
  description text not null
);

create table permissions (
  name text primary key check (name ~ '^[a-z_]+\.[a-z_.]+$'),
  description text
);

create table role_permissions (
  role role_name not null references roles (name) on delete cascade,
  permission text not null references permissions (name) on delete cascade,
  primary key (role, permission)
);

create table member_roles (
  member_id uuid not null references members (id) on delete cascade,
  role role_name not null references roles (name),
  granted_by uuid references members (id),
  granted_at timestamptz not null default now(),
  primary key (member_id, role)
);
-- One owner for the whole platform (decision D11).
create unique index member_roles_single_owner_idx on member_roles (role) where role = 'owner';
create index member_roles_role_idx on member_roles (role);

create table device_sessions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete cascade,
  device_label text not null,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index device_sessions_member_idx on device_sessions (member_id, last_seen_at desc);
