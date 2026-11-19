# 09 Admin dashboard

Owner: AI-5. Code: `lib/admin/dashboard.ts`, tests in `dashboard.test.ts`. Base: `integration` @ 1915e55.

## What it does
`getSummary` returns what the admin home screen shows first: payouts waiting for approval, payment attempts stuck on our side, open reconciliation records and support tickets that need staff. It reads only aggregate counts and never lists rows.

## Rules
- Each section has its own read permission: `admin.payouts.read`, `admin.payments.read`, `admin.reconciliation.read`, `admin.support.read`. A section the member may not see is left out. A support user therefore sees only tickets.
- A failed permission check other than `PERMISSION_DENIED` (expired session, MFA missing, password confirmation) is returned as is, so the screen can send the person to sign in. If no section is allowed the result is `PERMISSION_DENIED`.
- Sections load in parallel. A section that fails, times out (5 seconds) or returns untrustworthy numbers shows as `unavailable` and the others still show. The screen shows a retry state for it, never a zero.
- Numbers must be non negative whole numbers. A missing status counts as zero. Anything else hides that section and raises `onSectionError`.
- `attentionTotal` adds up the visible sections and is `null` when any visible section is unavailable, because the sum would be too low.
- No audit row: it shows counts, not personal data.

## What counts as needing attention
| Section | Number | Definition |
|---------|--------|------------|
| Payouts | awaiting approval | status `verified` |
| Payments | stuck | `initiating`, `processing` or `verifying` for more than 15 minutes |
| Reconciliation | open | open records |
| Support | needs staff | `open` plus `pending_staff` |

## Threat model
| Threat | Answer |
|--------|--------|
| Support sees money numbers | Per section permission, and the repository is not called for hidden sections. |
| A wrong or hostile count is shown as fact | Strict number check, section hidden instead. |
| One slow query hangs the whole page | Parallel loads with a 5 second limit per section. |
| Expired session looks like "no access" | Session errors are passed through. |
| Error text leaks internals | Unexpected errors become `INTERNAL` with the request reference only. |

## VERIFIED, ASSUMED, OPEN
- VERIFIED by reading `integration` @ 1915e55: the four permission names, the `support` role holds only the support one, `AdminCountsRepository` signatures, the status lists in `contracts/enums.ts`.
- ASSUMED: the definitions above, a 15 minute stuck threshold, a 5 second section limit. Requests D-1 to D-6 are in `docs/handoffs/ai5-contract-request-admin-dashboard.md`.
- OPEN: the counts repository is not reachable through `RepositoryProvider` yet (D-2), so nothing is wired and the screen would show every section as unavailable. There is no "failed today" number until D-1.
- NOT VERIFIED: no test has been run. They were desk checked against the code only. CI on the pull request is the evidence.

## Not in this PR
The dashboard screen and the wiring of the service into the app.
