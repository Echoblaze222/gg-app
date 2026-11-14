# Routes

Route groups in parentheses do not appear in URLs. Member screens live under `/app`, admin screens under `/admin`.
"Who may call" means who is allowed to reach it. Every privileged route also calls `requirePermission()` on the server.

## Pages
| URL | Owner | Who may call | Permission |
|-----|-------|--------------|------------|
| `/` | AI-3 (marketing) | public | none |
| `/how-it-works`, `/faq`, `/contact`, `/about` | AI-3 | public | none |
| `/legal/terms`, `/legal/privacy`, `/legal/payment-terms`, `/legal/refunds` | AI-5 | public | none |
| `/login`, `/register`, `/verify`, `/forgot-password`, `/reset-password` | AI-3 | public | none |
| `/mfa` | AI-3 | signed in, MFA pending | none |
| `/design-gallery` | AI-3 | development only, returns 404 in production | none |
| `/app` (home) | AI-5 | member | `member.history.read` |
| `/app/onboarding` | AI-5 | member | `member.profile.update` |
| `/app/contributions` | AI-5 | member | `member.plan.manage` |
| `/app/pay` | AI-5 | member | `member.payment.create` |
| `/app/payment-methods` | AI-5 | member | `member.payment_method.manage` |
| `/app/history` | AI-5 | member | `member.history.read` |
| `/app/history/[receiptNumber]` | AI-5 | member (own only) | `member.history.read` |
| `/app/withdrawals`, `/app/withdrawals/new` | AI-5 | member | `member.payout.request` |
| `/app/notifications` | AI-5 | member | `member.profile.read` |
| `/app/profile` | AI-5 | member | `member.profile.update` |
| `/app/security` | AI-5 | member | `member.security.manage` |
| `/app/support`, `/app/support/[ticketId]` | AI-5 | member | `member.support.create` |
| `/app/privacy` | AI-5 | member | `member.privacy.request` |
| `/admin/login` | AI-5 | privileged roles, MFA required | none |
| `/admin` (dashboard) | AI-5 | privileged roles | `admin.members.read` |
| `/admin/members`, `/admin/members/[id]` | AI-5 | privileged roles | `admin.members.read` |
| `/admin/contributions` | AI-5 | privileged roles | `admin.contributions.read` |
| `/admin/payments` | AI-5 | privileged roles | `admin.payments.read` |
| `/admin/withdrawals` | AI-5 | privileged roles | `admin.payouts.read` |
| `/admin/reconciliation` | AI-5 | privileged roles | `admin.reconciliation.read` |
| `/admin/announcements` | AI-5 | privileged roles | `admin.announcements.manage` |
| `/admin/support` | AI-5 | privileged roles | `admin.support.read` |
| `/admin/roles` | AI-5 | privileged roles | `admin.roles.read` |
| `/admin/security` | AI-5 | privileged roles | `admin.security.read` |
| `/admin/audit` | AI-5 | privileged roles | `admin.audit.read` |
| `/admin/settings` | AI-5 | privileged roles | `admin.settings.read` |

## API route handlers
| URL | Owner | Who may call | Notes |
|-----|-------|--------------|-------|
| `/api/auth/*` | AI-2 | public with rate limits | Register, login, logout, MFA, reset, reauth, devices, OAuth callback if Google is confirmed |
| `/api/payments/initiate` | AI-4 | member | Needs `member.payment.create`, idempotency key, rate limit |
| `/api/payments/verify` | AI-4 | member | Verifies with the provider, never trusts the client |
| `/api/payments/methods` | AI-4 | member | List and remove saved methods |
| `/api/payments/refunds` | AI-4 | admin | `admin.payments.refund`, reauth required |
| `/api/payouts/*` | AI-4 | member and admin | Request, OTP, cancel, approve, reject, mark paid |
| `/api/webhooks/paystack` | AI-4 | Paystack only | Signature verified, raw event stored first, idempotent |
| `/api/jobs/charge-due` | AI-4 | scheduler only | Authenticated with `CRON_SECRET` |
| `/api/jobs/reconcile` | AI-4 | scheduler only | Authenticated with `CRON_SECRET` |
| `/api/health` | AI-1 | public | Returns status only, no internals |

## Deviations from the briefs
- The brief names the component gallery `/_design`. Next.js treats folders that start with an underscore as private, so they cannot be routes. The gallery is `/design-gallery`.
