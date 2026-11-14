# Ownership Map

One owner per path. Do not edit paths you do not own. Ask through `docs/handoffs/`.

| Path | Owner |
|------|-------|
| `package.json`, lockfile, `tsconfig.json`, `next.config.ts`, `app/layout.tsx`, `.env.example`, `.github/CODEOWNERS`, `contracts/`, test configs | Integrator |
| `supabase/migrations/1000-1999_*`, `supabase/seed/`, `lib/db/`, `lib/supabase/`, `lib/observability/`, `lib/env.ts`, `.github/workflows/`, `docs/architecture/`, `tests/db/` | AI-1 |
| `supabase/migrations/2000-2999_*`, `lib/security/`, `lib/auth/`, `proxy.ts`, `app/api/auth/`, `docs/security/` | AI-2 |
| `components/ui/`, `components/motion/`, `components/brand/`, `styles/`, `lib/motion/`, `public/brand/`, `app/(marketing)/`, `app/(auth)/`, `docs/design/` | AI-3 |
| `supabase/migrations/4000-4999_*`, `lib/payments/`, `lib/contributions/`, `lib/ledger/`, `app/api/payments/`, `app/api/webhooks/`, `docs/payments/` | AI-4 |
| `supabase/migrations/5000-5999_*`, `app/(user)/`, `app/(admin)/`, `lib/notifications/`, `lib/support/`, `lib/legal/`, `components/features/`, `docs/product/` | AI-5 |

## Table ownership (who may change a table after AI-1 creates it)
AI-1 creates the first version of every table in migrations 1000-1999. Later changes to a table come from the range of its owner, except changes to existing tables, which only AI-1 may make on request.

| Domain | Tables | Later changes by |
|--------|--------|------------------|
| Identity and RBAC | members profile, roles, permissions, member roles, sessions and devices | AI-2 |
| Security | security events, login attempts, rate limit events, audit logs | AI-2 |
| Contributions | plans, obligations, settings | AI-4 |
| Payments and ledger | payment customers, payment methods, payment attempts, payment events, ledger entries, payouts, refunds, reconciliation | AI-4 |
| Communication | notifications, announcements, support tickets and messages | AI-5 |
| Legal and privacy | policy versions, policy acceptances, privacy requests, consent records | AI-5 |

Note for the repository layer: `lib/db/` (AI-1) is data access only. Business rules for the ledger live in `lib/ledger/` (AI-4) and call the repository interfaces.
