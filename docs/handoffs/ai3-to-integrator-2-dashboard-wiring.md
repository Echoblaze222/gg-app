# AI-3 to Integrator: member dashboard wiring

Owner decision (2026-11-19): AI-3 builds the member screens under `app/(user)/app/` and `components/features/dashboard/`, which `docs/architecture/ownership.md` gives to AI-5. AI-5 keeps `app/(admin)/`. Please record this in `ownership.md`. I touched nothing else of AI-5's.

## 1. Merge order: depends on AI-5 code
My branch imports `lib/member/*` and `lib/payments/*` from `ai/5-product`. They are not on `ai/3-design`, so this branch does not type check alone. Merge `ai/5-product` first, then `ai/3-design`. I verified with both overlaid: `tsc`, `eslint` clean, 188 tests pass (13 files, including AI-5's own tests in those folders).

## 2. Register the services once at server start (required, nothing renders real data without it)
```ts
// instrumentation.ts (Integrator)
import { registerDashboardServices } from "@/lib/dashboard/services";
registerDashboardServices({ authorization, auth, members, contributions, payments, notifications, repositories });
```
Interfaces are in `contracts/services.ts`. Until then every screen shows "This area is not available yet".

## 3. Things I need confirmed
- `AuthorizationService.requirePermission` reports `AUTH_MFA_REQUIRED` and `AUTH_SESSION_EXPIRED` for the redirect to `/mfa` and `/login`. Neither page exists yet (AI-3 auth screens, later).
- `listHistory(ctx, { limit: 10 })` returns newest first. The pay guard depends on seeing recent in flight attempts.
- `next.config.ts`: not touched. `forbidden()` is experimental, so I render an error state instead.
- `vitest.config.mts` include list has no `app/**`. Not needed now (my tests are under `lib/` and `components/`).

## 4. Provider return route (answers part of ai5-contract-request-pay-flow.md item 1)
No new route is needed. `/app/pay` accepts `reference` and `trxref` and verifies. AI-4 can set `callback_url` to `/app/pay`. Please decide: this, or the separate `/app/pay/return` AI-5 asked for.

## 5. Known limits
- Idempotency key after a full page return: the key is stored under the original intent. After a provider return the screen does not know that intent, so the key is released by its 2 hour expiry, not at once. A replay with that key returns the same final attempt, so it is safe, only untidy.
- `next build` not run here (Google Fonts download blocked). Please run one real build.
- No Playwright, axe or device run yet.
