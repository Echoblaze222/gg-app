# AI-2 design decisions (ADRs), threat model, spikes

Status: Day 1 items are implemented (`requirePermission`, audit service, webhook verifier, body parser, see `02-day1-spec.md`). Everything else is a draft for owner and Integrator review.
Tags: [doc] confirmed in an official doc I read, [spike] must be proven by a test before relying on it, [decision] my choice.

## ADR-1 Keep Supabase Auth as the identity provider [decision]

Options: (a) Supabase Auth, (b) custom auth with our own password and session tables.
Choice: (a). Password hashing, email verification, TOTP MFA and token handling stay in a maintained service, and the stack already uses it. Custom crypto and session code would be more code for us to get wrong.
Cost: some features (per device session list) are not first class. See ADR-6 and spike S1.

## ADR-2 Three layers of authorization [doc] [decision]

The Next.js 16 authentication guide says proxy checks should be optimistic (cookie only, no database) because proxy runs on every route including prefetches, and that most checks belong close to the data. It also says to treat Server Actions like public endpoints.

1. `proxy.ts`: optimistic redirect for signed out users. Never the only defense.
2. Data access layer: `requirePermission(perm)` called at the top of every route handler, server action and server data function. This is authoritative.
3. Row level security in the database as the last line (AI-1 owns tables, I supply policies for my tables).

Rule: a route with no `requirePermission` or an explicit `public` marker fails a CI check (static test that scans `app/api` and server actions).

## ADR-3 RBAC schema [decision]

Contracts fix the roles (`owner`, `admin`, `support`, `member`) and permission names (`contracts/permissions.ts`). AI-1 creates the tables; my 2000 range migrations change them later. `is_admin` is removed from authorization entirely.
Check function: `RoleRepository.listPermissions` (AI-1) backed by a SQL function with `SECURITY DEFINER` and a fixed `search_path`, so it cannot be hijacked. Result is never cached across requests.
Role changes: require recent reauthentication and write an audit row first (implemented in `grantRole` and `revokeRole`).
Bootstrap: first super admin is created by a one time documented command, not by a public route.

## ADR-4 MFA for privileged roles [spike]

Use Supabase TOTP. Implemented rule: any holder of a privileged role (`owner`, `admin`, `support`) is refused with `AUTH_MFA_REQUIRED` for every permission unless the session is MFA verified. The MFA fact comes from the session resolver, which reads verified token claims (`aal2`), not from UI state.
Unknowns: recovery options. See S2 and owner decision 4.

## ADR-5 Rate limiting in Postgres [decision]

Note: per the contracts, AI-1 implements `RateLimitRepository.hit` (atomic fixed window counter). My `RateLimiter` service builds keys and applies rules on top of it.
No Redis in the stated budget, so counters live in Postgres. Keys: endpoint plus HMAC of IP, endpoint plus HMAC of account identifier, and a global per endpoint ceiling.
Why hash: raw IP and email in a counter table add personal data for no benefit under the NDPA. The HMAC secret needs its own env name (`RATE_LIMIT_HMAC_SECRET`, contract request raised).
Lockout: progressive delay after repeated failures per account and per IP, never a hard permanent lock (that becomes a denial of service against a real user).
Same response and similar timing whether the account exists or not.
Revisit at finishing phase: if load tests show contention, move counters to a managed Redis behind the same interface.

## ADR-6 Sessions and devices [doc] [spike]

Facts from Supabase docs: sign out scopes are `global`, `local` and `others`; each access token carries a `session_id` claim matching a row in `auth.sessions`; a signed out session is removed. Third party write ups state that listing one user's sessions is not an official client API and that an access token stays valid until it expires.
Design: our own `auth_devices` table keyed by `session_id` (user agent summary, coarse location from IP, created, last seen, revoked at). The session resolver checks the token's `session_id` against it, so a revoked device is refused immediately even though its token has not expired. "Sign out everywhere else" also calls `signOut` with scope `others` to kill refresh. A short access token lifetime in the Supabase dashboard is a second guard.
Needs a `DeviceSessionRepository` (contract request raised).
Open: S1 must prove the check cost is acceptable and that refresh after revoke fails.

## ADR-7 Append only audit log [decision]

Note: per the contracts, AI-1 owns the `audit_logs` table and `AuditRepository`. Database rules (insert only, no update or delete, trigger that raises) are an AI-1 migration and an AI-1 database test, and I will review them.
My `AuditService` (implemented): redacts secret looking keys, caps detail size, never stores passwords, tokens, card data or full bodies. `record` is best effort. `recordStrict` fails closed and is used for privileged actions.
Tamper evidence by hash chaining is deferred until the owner asks for it.

## ADR-8 Validation, limits, headers, CSRF [doc] [decision]

`parseBody(request, schema, {maxBytes, requestId})` (implemented) reads the stream with a byte cap before parsing, rejects wrong content type, and returns error codes from `contracts/errors.ts`.
CSRF: Server Actions are covered by the framework origin check, route handlers that use cookies get an explicit Origin and Host check helper, cookies are `HttpOnly`, `Secure`, `SameSite=Lax`.
Headers and CSP follow the Next.js 16 CSP guide. CORS is an allowlist from env, default deny.
Headers live in `proxy.ts`. `next.config.ts` is shared and not mine, so any header needing it goes through a handoff.

## ADR-9 Generic webhook verifier [decision]

`createHmacWebhookVerifier({algorithm, encoding})` (implemented) returns the frozen `WebhookVerifier`, with constant time comparison on the raw body. It makes no provider assumptions: AI-4 supplies the algorithm and encoding after reading the provider's current official docs, which is what the AI-4 brief requires.

## Threat model summary (STRIDE, top items)

| Threat | Example | Control | Test |
|--------|---------|---------|------|
| Spoofing | Credential stuffing | Rate limits, lockout, generic errors, MFA for admins | T1 brute force, T2 enumeration timing |
| Spoofing | Session fixation or theft | Session rotation on login and privilege change, `HttpOnly` cookies, device check | T3 fixation, T4 revoked device |
| Tampering | Member edits own role or balance | RBAC server side, RLS, sensitive columns not user writable | T5 privilege escalation (done in unit tests) |
| Tampering | Forged webhook | Signature verification, replay guard (AI-4) | T6 forgery (done in unit tests) |
| Repudiation | Admin denies a role change | Append only audit, fail closed | T7 audit immutability (AI-1 database test) |
| Info disclosure | Account existence leak, secrets in logs | Uniform responses, log redaction test | T8, T9 (T9 done) |
| Denial of service | Lockout abuse, large payloads | Progressive delay, byte caps | T10 |
| Elevation | Admin route without permission check | CI scan for unguarded routes | T11 |
| Elevation | Admin without MFA | MFA required server side | T12 (done in unit tests) |

## Spikes (proof before dependence)

- S1: session list and revoke. Prove the `auth_devices` check blocks a revoked session on the next request and that refresh fails. Measure added latency.
- S2: MFA. Prove `aal2` can be enforced server side from claims, find what recovery options exist, confirm more than one verified factor per user is allowed.
- S3: signup and reset responses for an existing email under the project's confirmation settings. Prove responses and timing do not reveal existence, or add our own normalisation.
- S4: dropped (email only at launch).

## Owner decisions (recorded 2026-11-14)

1. Email only login at launch. No phone login, so no SMS provider and spike S4 is dropped. Phone can be added later as a new ADR.
2. Google sign-in is approved. It must go through the same session, device, audit and rate limit paths as email login. Privileged roles still need MFA even when they signed in with Google. Account linking rule: a Google identity is linked to an existing account only when the email is verified by Google and matches, to prevent account takeover by email reuse.
3. First super admin is the website owner, who is the client (the developer is not the owner and holds no standing admin role). Bootstrap by a documented one time command, run by the developer on the client's behalf with the client's own email, not by a public route.
4. MFA recovery: recommended and pending client confirmation. Super admin must enroll two authenticators on different devices at setup (second factor), instead of building recovery codes. A documented break glass procedure covers total loss: reset by a second authorized person using the service role, written to the audit log, with the client's identity re-verified out of band. Spike S2 confirms Supabase allows more than one verified factor per user.

## Still open

- Access token lifetime in the Supabase dashboard: I recommend a short lifetime. Needs whoever owns the Supabase project (client or developer on their behalf).
