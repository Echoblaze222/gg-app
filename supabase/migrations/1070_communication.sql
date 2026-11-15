-- 1070: notifications, announcements, support.

create table notifications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete cascade,
  type notification_type not null,
  channel notification_channel not null default 'in_app',
  title text not null check (char_length(title) between 1 and 200),
  body text not null check (char_length(body) <= 2000),
  link text check (link is null or link like '/%'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_member_idx on notifications (member_id, created_at desc, id desc);
create index notifications_unread_idx on notifications (member_id) where read_at is null;

create table announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  body text not null check (char_length(body) <= 8000),
  published_at timestamptz,
  created_by uuid not null references members (id),
  created_at timestamptz not null default now()
);
create index announcements_published_idx on announcements (published_at desc, id desc) where published_at is not null;

create table support_tickets (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete cascade,
  subject text not null check (char_length(subject) between 3 and 120),
  status support_ticket_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_tickets_member_idx on support_tickets (member_id, created_at desc, id desc);
create index support_tickets_status_idx on support_tickets (status, updated_at, id);
create trigger support_tickets_updated_at before update on support_tickets for each row execute function set_updated_at();

create table support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets (id) on delete cascade,
  author_id uuid not null references members (id),
  from_staff boolean not null default false,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index support_messages_ticket_idx on support_messages (ticket_id, created_at, id);
