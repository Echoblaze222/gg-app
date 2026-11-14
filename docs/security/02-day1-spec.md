# AI-2 Day 1 spec: authorization, audit, webhook verifier, body parser

Status: implemented on `ai/2-security`. Contracts used (frozen, v1.0.0): `AuthorizationService`, `AuditService`, `WebhookVerifier`, `RoleRepository`, `MemberRepository`, `AuditRepository`, `ERROR_DEFINITIONS`, `PERMISSIONS`, `REAUTH_REQUIRED_PERMISSIONS`, `PRIVILEGED_ROLES`.

## Architecture note (supersedes parts of ADR-5 and ADR-7)

The contracts split the work: AI-1 owns the tables and the repository implementations (including the append only audit table and the atomic rate limit counter). My code is plain TypeScript services built from repository interfaces passed in as dependencies. That makes each service testable with in memory fakes and keeps database rules in AI-1 migrations. My own `2000-2999` migrations come later, as changes to the identity and security tables once AI-1 has created them.

## 1. requirePermission(ctx, permission, opts)

Inputs: request context, a permission name, optional `requireReauth`.
Dependencies: `SessionResolver` (internal interface, verifies the session and returns member id, MFA state, last reauthentication; implemented by the auth module), `MemberRepository`, `RoleRepository`, audit service.
Never throws. Every failure is a `Result` with an error code from the taxonomy and `ctx.requestId` as the reference.

Check order (first failure wins):
1. No verified session: `AUTH_SESSION_EXPIRED`.
2. Member missing: `AUTH_SESSION_EXPIRED` (same code, no existence leak). Status `suspended` or `closed`: `AUTH_ACCOUNT_SUSPENDED`. Status `pending_verification`: `AUTH_EMAIL_NOT_VERIFIED`.
3. Permission not held through roles: `PERMISSION_DENIED`, audited as `denied`. This runs before the MFA and reauth checks so a caller without the permission learns nothing about those states.
4. Holder of any privileged role (`owner`, `admin`, `support`) without MFA verified in this session: `AUTH_MFA_REQUIRED`. Applies to every permission, including member ones.
5. Reauthentication needed (permission in `REAUTH_REQUIRED_PERMISSIONS` or `opts.requireReauth`) and not recent: `AUTH_REAUTH_REQUIRED`.
6. Success: `SessionInfo`.
Any dependency error: `INTERNAL`, denied (fail closed), logged by the caller wiring.
Unknown permission string: `PERMISSION_DENIED` (not in the `PERMISSIONS` list).

`grantRole` and `revokeRole` (also in the frozen `AuthorizationService`): require `admin.roles.manage` (owner only by default, reauth required), refuse any change to one's own roles (also stops the last owner removing themselves), write a strict audit row BEFORE changing the role so no privileged change exists without a trail, and record a failure row if the change itself fails. Known limit: two owners revoking each other at the same moment could leave zero owners. Closing that needs a database level check (handoff to AI-1 if the owner wants it).

Abuse cases: T5 escalation (member asks for admin permission), T11 unguarded route (CI scan, later), T12 admin without MFA, suspended member with a still valid token, dependency outage must not grant access.

## 2. Audit service

`record(ctx, entry)`: best effort. Redacts secret looking keys from `detail` (passwords, tokens, secrets, otp, authorization, cookie, card, cvv, pin, key), caps depth and size, never throws. Failure is logged through an injected logger (error name only, never messages that could echo values).
`recordStrict(ctx, entry)`: same, but throws `AppError("INTERNAL")` if the write fails. Used by role changes and other privileged actions so they fail closed when the audit row cannot be written.
Abuse cases: T7 immutability (AI-1 database test), T9 secrets in logs (redaction test).

## 3. Webhook verifier

`createHmacWebhookVerifier({ algorithm, encoding })` returns the contract `WebhookVerifier`. Algorithm and encoding are required with no default, because AI-4 must take them from the provider's current official documentation. Constant time compare over equal length buffers. Missing header, empty secret, wrong length, or wrong encoding returns false. Never throws.
Abuse cases: T6 forgery, length mismatch, null header, empty secret, case differences in hex, body tampering by one byte.

## 4. parseBody(request, schema, options)

Reads the body stream with a byte cap before parsing. Requires a JSON content type. Returns `PAYLOAD_TOO_LARGE`, `VALIDATION_FAILED` (with field names only, never echoed values), or the parsed value. Does not trust `Content-Length` alone.
Abuse cases: oversize body without a content length header, wrong content type, malformed JSON, extra fields (stripped by the schema), prototype pollution keys.

## Verification evidence

- 84 tests pass (33 contract tests plus 51 security tests). `tsc --noEmit` and `eslint` clean on the new paths.
- Tests were written first and failed because the modules did not exist.
- Mutation check: eight controls were broken on purpose (MFA check, unknown permission check, closed status, strict audit, empty secret check, length check, redaction, byte cap). Seven were caught. The one that was not caught, the explicit length check in the webhook verifier, is behaviourally equivalent because `timingSafeEqual` throws on unequal lengths and that is caught and returns false. A gap found by the check (store returning an unknown permission string) got its own test, and the mutant is now caught.
- Secret scan on new files: clean.

## Not in this milestone

Auth flows, sessions and devices, rate limiter, MFA, security headers, `proxy.ts`, and my own migrations. Each gets its own spec before code.

## Contract requests raised (see `docs/handoffs/`)

1. `DeviceSessionRepository` for the sessions and devices table (needed for device list and revoke).
2. New env name `RATE_LIMIT_HMAC_SECRET`. `OTP_PEPPER` must not be reused for a different purpose.
3. Lockfile on `integration` is out of sync with `package.json`, so `npm ci` fails. Integrator action.
