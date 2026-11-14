# Permissions

Source of truth is `permissions.ts`. This page is the human readable view.

Format: `<area>.<action>`. The owner role holds every permission. Members hold the `member.*` set. Support cannot touch money or roles. Admin cannot manage roles, adjust the ledger or change settings.

Actions that need the password confirmed again (reauthentication) are listed in `REAUTH_REQUIRED_PERMISSIONS`.

| Area | Permissions |
|------|-------------|
| Member self service | `member.profile.read`, `member.profile.update`, `member.plan.manage`, `member.payment.create`, `member.payment_method.manage`, `member.history.read`, `member.payout.request`, `member.support.create`, `member.privacy.request`, `member.security.manage` |
| Admin members | `admin.members.read`, `admin.members.suspend`, `admin.members.update` |
| Admin money | `admin.contributions.read`, `admin.payments.read`, `admin.payments.refund`, `admin.payouts.read`, `admin.payouts.decide`, `admin.ledger.adjust`, `admin.reconciliation.read`, `admin.reconciliation.resolve` |
| Admin communication | `admin.announcements.manage`, `admin.support.read`, `admin.support.reply` |
| Admin security and system | `admin.roles.read`, `admin.roles.manage`, `admin.security.read`, `admin.audit.read`, `admin.settings.read`, `admin.settings.update`, `admin.policies.manage`, `admin.privacy.manage` |

Every privileged route calls `requirePermission()` on the server. Hiding a button is never the check.
