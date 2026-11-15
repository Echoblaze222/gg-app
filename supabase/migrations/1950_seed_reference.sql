-- 1950: seed reference data. Mirrors contracts/permissions.ts; a test keeps the two in sync.
-- Not fake data: roles, permissions and default configuration the app needs to run.

insert into roles (name, description) values
  ('owner', 'The single site owner. Holds every permission.'),
  ('admin', 'Trusted staff. Everything except role management, ledger adjustments and settings changes.'),
  ('support', 'Support staff. Reads members and handles tickets and announcements.'),
  ('member', 'A regular member. Self service only.');

insert into permissions (name) values
  ('member.profile.read'),
  ('member.profile.update'),
  ('member.plan.manage'),
  ('member.payment.create'),
  ('member.payment_method.manage'),
  ('member.history.read'),
  ('member.payout.request'),
  ('member.support.create'),
  ('member.privacy.request'),
  ('member.security.manage'),
  ('admin.members.read'),
  ('admin.members.suspend'),
  ('admin.members.update'),
  ('admin.contributions.read'),
  ('admin.payments.read'),
  ('admin.payments.refund'),
  ('admin.payouts.read'),
  ('admin.payouts.decide'),
  ('admin.ledger.adjust'),
  ('admin.reconciliation.read'),
  ('admin.reconciliation.resolve'),
  ('admin.announcements.manage'),
  ('admin.support.read'),
  ('admin.support.reply'),
  ('admin.roles.read'),
  ('admin.roles.manage'),
  ('admin.security.read'),
  ('admin.audit.read'),
  ('admin.settings.read'),
  ('admin.settings.update'),
  ('admin.policies.manage'),
  ('admin.privacy.manage');

-- Same mapping as DEFAULT_ROLE_PERMISSIONS in contracts/permissions.ts. A test compares the two.
insert into role_permissions (role, permission)
select 'owner'::role_name, name from permissions
union all
select 'admin'::role_name, name from permissions
  where name not in ('admin.roles.manage', 'admin.ledger.adjust', 'admin.settings.update')
union all
select 'support'::role_name, name from permissions
  where name in ('admin.members.read', 'admin.support.read', 'admin.support.reply', 'admin.announcements.manage')
union all
select 'member'::role_name, name from permissions where name like 'member.%';

-- Defaults the owner can change in the admin settings screen. Product questions are still open, see docs/architecture/01-vision-and-protocol.md.
insert into app_settings (key, value, description) values
  ('contribution.min_kobo', '10000', 'Smallest contribution in kobo (100 naira). Default, owner to confirm.'),
  ('contribution.max_kobo', '100000000', 'Largest single contribution in kobo (1,000,000 naira). Default, owner to confirm.'),
  ('payout.min_kobo', '100000', 'Smallest withdrawal in kobo (1,000 naira). Default, owner to confirm.'),
  ('payout.otp_ttl_seconds', '600', 'How long a withdrawal code stays valid.'),
  ('payout.otp_max_attempts', '5', 'Wrong code attempts before the challenge is locked.');
