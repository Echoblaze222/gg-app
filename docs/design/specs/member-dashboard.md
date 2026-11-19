# Member dashboard (`/app`) and pay screen (`/app/pay`)

Status: built by AI-3 on `ai/3-design` after the owner moved the member screens from AI-5 to AI-3 (2026-11-19). Admin dashboard stays with AI-5.
Tests: unit and component tests pass locally (see handoff). Not run: `next build` (fonts cannot be downloaded in the authoring sandbox), Playwright, axe, a real device.

## Division of work
AI-5 owns the rules: `lib/member/*` (what a number or status means) and `lib/payments/*` (pay reducer, idempotency keys, polling schedule, safe redirect). AI-3 owns presentation and the thin I/O around it (`components/ui`, `components/features/dashboard`, `lib/dashboard`, `app/(user)/app`). The screens never decide what a value means.

## Home cards and where each value comes from
| Card | Source | Formula or rule |
|------|--------|-----------------|
| Next contribution (black hero) | `getNextDue`, `listPlans`, `listHistory(10)` through AI-5 `buildHomeView` | Amount and urgency from the obligation. Pay is enabled only when no in progress payment exists for it. If recent payments failed to load, pay is blocked with the reason |
| Available balance | `getBalance` through `balanceView` | Shown only if no value is negative and available + held = ledger. Otherwise "Balance unavailable", no number |
| Contribution schedule | `listObligations(12)`, `lib/dashboard/schedule.ts` | Window sorted by due date, two entries before the first current one, at most 6. Cancelled and corrupt rows are left out. Ring = paid / shown |
| Payments in progress | `listHistory(10)` filtered to in flight statuses | Every row says "Do not pay again" (AI-5 copy) |
| Unread notifications | `unreadCount` | One sentence under the heading, only when above zero |

No other number is shown. There is no "cycle total", percent change or goal, because no contract field defines them.

## Pay screen
Two entries on one route (`/app/pay`), so no new route is needed:
1. From the home card: `/app/pay?obligation=<id>`. The server loads the real next due obligation. If the id no longer matches it says the page is out of date.
2. Provider return: `/app/pay?reference=...&trxref=...`. Parsed by AI-5 `parsePaymentReturn`, then verified with `verifyAndSettle`, then polled with `getAttempt` on AI-5's backoff schedule. The redirect proves nothing.

`PayController` only does I/O and rendering. All safety rules are in AI-5's reducer: success only from a server attempt marked `successful`, a failed verification is "outcome unknown" (never "failed"), no new payment from an unknown state, idempotency key kept until a final outcome. Server action `initiatePaymentAction` also checks that a scheduled contribution matches the member's real next due obligation (id and amount) before calling `PaymentService.initiate`.

## States
Loading: skeleton per screen (after 300 ms). Empty: each card explains why. Error: per card, with message, whether money moved, what to do, retry safety and reference. Offline: banner, pay does not start, nothing is sent. Forbidden: error state. Session expired or MFA needed: redirect to `/login` or `/mfa`. Services not registered: "not available yet" error state, never fake data.

## Not built, on purpose
- Links to `/app/history`, `/app/notifications`, `/app/plan` and the rest: those screens do not exist yet, and no link points at a missing route. Each gets a nav entry when it lands.
- Realtime updates (needs the AI-1 transport). The home refreshes on reload or the retry buttons.
- A saved card card and a recent activity list: not in AI-5's home spec. They belong on the cards and history screens.
- Logo and brand mark: wordmark text only until `components/brand` ships.
