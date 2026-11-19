# Integrator: wiring AuthService

From: Integrator (took over the AI-2 wiring milestone because AI-1 and AI-2 ran out of tokens). To: AI-2, AI-3, owner. Date: 2026-11-17.

## What changed
- `lib/auth/composition.ts` builds the real `AuthService` for one request from the pieces AI-2 already wrote (identity adapter, session resolver, reauth store, device gate, rate limiter, audit, authorization).
- `lib/db/auth-repositories.ts` is the first part of AI-1's missing `lib/db/`: service role repositories for members, roles, policies, security events, audit, rate limits and devices. Other repositories (payments, ledger and so on) are still not built.
- `lib/security/events.ts` implements `SecurityEventService`, which nothing implemented before.
- `supabase/migrations/2100_rate_limit_hit.sql` adds the atomic counter the limiter needs. Applied to the Supabase project as `ai2_2100_rate_limit_hit` and checked (count 1, then 2).
- `app/(auth)/auth-gateway.ts` now returns the real service. `getAuthService()` is async, so `actions.ts` awaits it. Behaviour is otherwise unchanged: any failure returns `null` and the form shows "temporarily unavailable" with a reference.
- `lib/auth/supabase-admin.ts` also returns the service role `client` so repositories reuse the one place that reads the key.
- Every successful login now creates or refreshes a `device_sessions` row, so the device list and remote sign out have something to act on.

## Environment variables that must exist on Vercel
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or the anon key), `SUPABASE_SERVICE_ROLE_KEY`, `RATE_LIMIT_HMAC_SECRET` (at least 32 random characters). Without any of them the forms stay on "temporarily unavailable" and the server log names the missing one.

## Still open
1. No terms or privacy policy is published, so registration stays closed on purpose. Legal text needs the owner and legal review (`policy_versions.draft`).
2. Supabase email templates must link to the app: recovery to `/reset-password?token={{ .TokenHash }}`. Check Auth settings: email confirmation on, site URL set.
3. Not built: MFA enrolment, `/verify` page, Google OAuth, phone login (owner decision: email only at launch).
4. Nothing was run locally. CI on the pull request is the first typecheck, lint and test run of this code.
5. `rate_limits` rows are never deleted. A cleanup job belongs to the finishing phase.
