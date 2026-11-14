# Implementation Map (Phase 0 audit of the legacy app)

Source: branch `legacy-v0` (commit c7dd011, identical to `main` when it was created). Audit method: read every file in `app/`, `components/`, `lib/`, `proxy.ts`, README and `package.json`, then read the Next.js 16 docs shipped in `node_modules/next/dist/docs/`.

Not auditable: the SQL migration `001_gods_grace_schema.sql` named in the README is not in the repository. The legacy row level security rules are therefore unknown and must be treated as absent.

## What the legacy app is
God's Grace Fintech: a small Next.js 16 + Supabase savings app. About 4,700 lines. Routes: `/login`, `/register`, `/dashboard`, `/admin`, `/auth/callback`.

Tables touched by the legacy code: `profiles`, `contributions`, `payouts`, `notifications`, `audit_logs`, `app_settings`, plus the RPC `verify_payout_otp` and the edge function `send-otp`.

## Business rules recovered from the legacy code (reuse as requirements, not as code)
| Rule | Legacy source | Carried into the rebuild as |
|------|---------------|-----------------------------|
| Money is stored as integer kobo | `fixed_amount: Number(amount) * 100` | Kept. Integer kobo plus currency column. |
| Member picks a plan type and a fixed amount | `register/page.tsx` | Contribution plan with frequency daily, weekly, monthly and a member chosen amount. |
| Contribution is confirmed before it counts | `status: pending_verification`, then admin confirms | Replaced by provider verification. Admin confirmation stays only for the manual transfer channel, if the owner keeps that channel. |
| Member requests a payout to a bank account | `payouts` table | Payout request with destination snapshot, admin approval, disbursement record. |
| Payout needs an active account, trust score 50 or more, enough balance, and no other pending payout | `checkBalance` | Payout eligibility rules, server side, configurable. |
| Payout needs an OTP | `dbVerifyOtp`, `dbSendOtp` | Step up verification, server side, hashed and short lived. Never stored in plain text. |
| Trust score, contribution streak, defaulter count | `profiles`, `AdminStats` | Derived values, configurable weights. Exact formulas are an open question. |
| Admin actions are audited | `audit_logs` inserts | Kept, but written by the server only, never by the browser. |
| Admin sets the collection bank account | `app_settings` | System configuration, admin only, audited. |

## Weaknesses found (replace, do not preserve)
1. **Authorization lives in the browser.** `lib/auth-guard.ts` reads `profiles.is_admin` from a client component and redirects. That is a UI convenience, not security.
2. **The browser writes money records.** `dbMakeContribution`, `dbConfirmContribution`, `dbRequestPayout`, `dbApprovePayout` and the audit inserts all use the anon key from the client. Safety depends entirely on RLS rules that are not in the repository.
3. **Balance is a mutable column.** `profiles.total_saved` can be changed in place. Replace with a ledger where balance is a sum of immutable entries.
4. **One boolean for admin.** `is_admin` has no permissions, no least privilege, no MFA.
5. **Free text status values** such as `Pending`, `Approved`, `Suspended`. Replace with enums.
6. **No payment provider code.** Paystack is only mentioned in comments and the README checklist. No webhook, no verification, no idempotency.
7. **Test credentials in the README**, including an admin password. Removed with the README. Must never be valid anywhere.
8. **Deprecated package** `@supabase/auth-helpers-nextjs` installed next to `@supabase/ssr`. Removed.
9. **Large page components** (admin 809 lines, dashboard 672 lines) mixing data access, rules and presentation.

## Reuse decision
| Item | Decision |
|------|----------|
| Next.js 16, React 19, Tailwind 4, TypeScript 5, ESLint 9, Supabase tooling | Keep |
| `proxy.ts` | Rebuilt by AI-2. The file name `proxy.ts` is correct for Next.js 16 (`middleware` is deprecated). The README was stale. Proxy is only for optimistic session refresh and redirects, never the only authorization check. |
| `lib/supabase/server.ts`, `client.ts` | Rebuilt by AI-1 under `lib/supabase/`. |
| `app/`, `components/`, `lib/hooks/`, `lib/auth-guard.ts`, `public/*.svg` | Removed from `integration`. Recoverable from `legacy-v0`. |
| README with credentials | Removed and replaced. |

## Next.js 16 facts confirmed from the bundled docs
- `proxy.ts` at the project root replaces `middleware.ts`. It runs before routes render and should not rely on shared modules or globals.
- The bundled docs have a dedicated authentication guide and a content security policy guide. AI-2 reads both before writing auth code.
