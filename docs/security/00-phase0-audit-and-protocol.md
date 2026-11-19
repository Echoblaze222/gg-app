# AI-2 Phase 0: Legacy audit and working protocol

Scope: auth, authorization, session handling in the legacy `main` (commit cloned 2026-11-14). Owner: AI-2.
Not in scope here: payments (AI-4), UI (AI-3, AI-5). Findings that touch them go to handoffs.

## 1. What I inspected

`proxy.ts`, `lib/supabase/{client,server}.ts`, `lib/auth-guard.ts`, `app/auth/callback/route.ts`, `app/login`, `app/register`, `app/admin`, `app/dashboard`, `lib/hooks/gg.ts`, `package.json`, `README.md`, `AGENTS.md`, and the Next.js 16 docs shipped in `node_modules/next/dist/docs/` (`proxy`, `authentication`, `data-security` guides).

Not found in the repo: the SQL migration `001_gods_grace_schema.sql` named in the README. So RLS policies are unverified. Every finding about database exposure is marked "unverified".

## 2. Findings

| ID | Finding | Evidence | Severity | Action |
|----|---------|----------|----------|--------|
| L1 | Authorization is client side only. Role checks run in browser hooks and pages by reading `profiles.is_admin` | `lib/auth-guard.ts`, `app/admin/page.tsx` line 259 to 264, `app/dashboard/page.tsx` line 368 to 373 | Critical | Replace with server side `requirePermission()` |
| L2 | `proxy.ts` only refreshes the session cookie. It gates no route | `proxy.ts` | High | Rewrite as optimistic redirect only, real checks in the data access layer |
| L3 | Profile is created from the browser with `upsert`, including `is_admin`, `trust_score`, `total_saved`, `fixed_amount` | `app/register/page.tsx` line 119 to 133 | Critical if RLS allows self update (unverified) | Profile creation moves server side or to a DB trigger. Sensitive columns not writable by the user. Handoff to AI-1 for RLS |
| L4 | Raw provider error text is shown to the user (`authError.message`) | `app/register/page.tsx` | Medium | Safe error codes from `contracts/errors.ts`, no account enumeration |
| L5 | `supabaseAdmin` (service role, bypasses RLS) is created at module load and exported | `lib/supabase/server.ts` | High | Replace with a narrow server only module, used by a small named set of functions |
| L6 | Single boolean `is_admin` means no least privilege, no role audit | schema usage across app | High | RBAC tables and permission helper |
| L7 | Test credentials (admin and users) published in README | `README.md` | High if ever valid | Legacy README removed by Integrator. Rotate those accounts if they exist anywhere |
| L8 | Deprecated `@supabase/auth-helpers-nextjs` installed beside `@supabase/ssr` | `package.json` | Low | Dependency handoff to Integrator |
| L9 | Phone is stored but never verified | register flow | Medium | Owner chose email only login at launch, so phone stays an unverified optional profile field |
| L10 | Callback swallows errors with an empty `catch` and redirects with a generic code | `app/auth/callback/route.ts` | Low | Handled in the Google sign-in milestone |
| L11 | Money fields computed in the browser (`Number(amount) * 100`) | `app/register/page.tsx` | Medium, not mine | Handoff to AI-4 |
| L12 | No rate limiting, no MFA, no audit log, no lockout | whole app | High | Deliverables 3, 4, 6 |

Reuse: nothing from the legacy auth code. Keep only the dependency choice (`@supabase/ssr`, `@supabase/supabase-js`).

## 3. Working protocol (applies to every deliverable)

The aim is to find bugs on paper before they exist in code.

1. **Ready check.** Contracts I depend on are merged to `integration`. If not, I write the interface stub from `contracts/` and stop on anything that needs a contract change (handoff file, no guessing).
2. **Research first.** Read the official doc for any library or platform behavior I rely on (Next.js 16 local docs, Supabase docs). Record the source in the ADR. If a doc is silent, it becomes a spike, not an assumption.
3. **Spec.** One short spec per feature before code: data flow, states (idle, validating, processing, success, recoverable failure, terminal failure), authorization rule, audit entry, error codes, mobile concern for the caller, retry safety.
4. **Threat check.** STRIDE pass on the spec. Each threat becomes a named abuse case test.
5. **Tests first.** Write the failing abuse case and happy path tests. Test doubles live only under `tests/`.
6. **Smallest implementation** that makes the tests pass. No speculative features.
7. **Verify.** Lint, type check, tests, secret scan, a mutation check (break each control on purpose and confirm a test fails), and a manual probe against a local Supabase for anything touching RLS or sessions.
8. **Review gate.** Self review against the PR checklist in `00-SHARED-RULES`. One PR per milestone into `integration`.
9. **Evidence.** PR description lists commands run and their results. Anything unverified is stated as unverified.
10. **Change control.** Decisions live as numbered ADRs in `01-design-decisions.md`. A changed decision supersedes the old one, it is not edited away.

## 4. Build order (dependency driven)

1. Day 1: `requirePermission()`, audit service, webhook verifier, body parser (done, see `02-day1-spec.md`).
2. Migrations in the 2000 range as changes to AI-1 tables: RBAC seed, devices, security tables. Written with RLS and tests.
3. Rate limiting service.
4. Auth flows and sessions (email, Google).
5. MFA for privileged roles.
6. Secure headers, CORS allowlist, CSRF checks, `proxy.ts`.
7. Security event detection.
8. Threat model, test plan, incident runbook finalised with real results.
