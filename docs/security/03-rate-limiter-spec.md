# AI-2 spec: rate limiter

Contract: `RateLimiter.check(ctx, rule, { memberId })` returns `Result<{ remaining }>` (frozen). Built on `RateLimitRepository.hit(key, windowSeconds)` (AI-1, atomic fixed window counter) and `SecurityEventService.record`.

## Behaviour

- Two counters per check: one per client address, one per account when `memberId` is given. Both are always counted, so a blocked call still costs the attacker.
- Keys are `<rule>:ip:<h>` and `<rule>:acct:<h>` where `<h>` is the first 32 hex characters of HMAC-SHA256 of the value. Raw addresses and ids never reach the counter table. The secret is passed in at construction (env `RATE_LIMIT_HMAC_SECRET`, contract request raised). A secret shorter than 32 characters makes construction throw, so a misconfigured deployment fails at boot, not silently.
- A missing client address uses one shared `unknown` bucket. It cannot be used to dodge the limit.
- Blocked when either count is above `rule.limit`: `RATE_LIMITED` (429, retry safe).
- Allowed: `remaining = limit - max(counts)`.
- Security event `rate_limited` (severity `low`) is written only on the first blocked hit of a window per scope (count equals limit plus 1). This bounds writes during an attack. The event has the rule name and scope, never the address.
- Counter store failure: fail closed with `SYSTEM_UNAVAILABLE` (503, retry safe). A failed security event write is logged and never changes the decision.
- Invalid rule (non integer, below 1): `INTERNAL`, logged. Developer error, never silently allowed.
- Never throws from `check`.

## Abuse cases (tests)

R1 limit reached then blocked, R2 per account limit holds when the address changes, R3 per address limit holds when the account changes, R4 missing address shares a bucket, R5 raw address and id absent from keys, R6 events bounded, R7 store down fails closed, R8 event write failure does not flip the decision, R9 bad rules rejected, R10 weak secret rejected at construction, R11 different rules do not share counters.

## Verification evidence

97 tests pass in total (13 new). `tsc --noEmit` and `eslint` clean. Mutation check: seven controls broken on purpose (limit boundary, account scope, event dedupe, fail closed, hashing, rule validation, secret length), all seven caught.

## Known limits

- Fixed windows allow up to twice the limit across a window boundary. Acceptable for login style limits, revisit for money endpoints with AI-4.
- IPv6 clients can rotate inside their own /64. Grouping by /64 is a later hardening step.
- The error shape has no retry-after field (frozen). The route layer can add a `Retry-After` header using the window length.
