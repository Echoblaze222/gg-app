# Member home, history and receipt spec (M3, logic layer)

Status: code pushed to `ai/5-product`, tests written, NOT executed (no network or CI connector in the authoring session). Screens wait for AI-3 components.

## Why this layer exists
The screens must never decide what a number or a status means. All of that lives in `lib/member/` as pure functions, so the rules are tested once and the screens only render.

## Rules that the code enforces
1. Money is integer kobo. `formatNaira` throws for negative, fractional or unsafe values. A corrupt amount is an error, never a plausible looking number.
2. The balance is shown only if no value is negative and available + held = ledger. Otherwise the view is `unverified` and no amount is shown.
3. Only the server status `successful` is ever shown as paid. Every in progress status says "Do not pay again". Only failed, cancelled and expired say "you were not charged".
4. Paying from the home card is allowed only when it is known that no payment for that obligation is in progress. If the recent payments could not be loaded, paying is blocked. The server stays authoritative, this is a UX guard on top of idempotency keys.
5. A receipt link exists only for a successful payment with a known receipt number, and the number is URL encoded.
6. Failure text for a stored failure code comes from the contract and only for `PAYMENT_*` codes. Anything else shows nothing.
7. The business calendar is Africa/Lagos (UTC+1, no daylight saving). Dates and times shown to members use it.
8. Each home section succeeds or fails alone. One failing call never blanks the screen.

## States
| State | Home behaviour |
|-------|----------------|
| Loading | Skeleton per section |
| Empty | No plan: invite to set one up. Paused: say so. Nothing due: say so |
| Error | Section shows `error.message`, `error.action` and the reference. Other sections stay |
| Offline | Last data stays visible, refetch on reconnect (same pattern as notifications) |
| Success | Balance, next due with urgency, pending payments, unread badge |
| Processing | Pending payments list, pay button disabled with the reason |

## Authorization
Home and history use `member.history.read`. The service layer enforces it, these functions only format.

## Open items
- What a missed payment means is an owner decision (RESEARCH.md section 12). The view shows the fact only.
- Receipt links are incomplete until the receipt request in `docs/handoffs/ai5-contract-request-receipt-link.md` is answered.
- Needs a recent page of at least 10 attempts so in progress payments are not missed. The caller must pass that.
