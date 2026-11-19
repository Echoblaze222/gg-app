# M3 mutation log

Protocol step 5: each important rule was broken on purpose in the source, the M3 test files were run, and the mutant had to be killed (at least one test fails). The source was restored after every run. Runner: a throwaway script outside the repo, one textual replacement per mutant.

Result: 39 mutants, 39 killed. Four mutants needed attention first:

- `closed attempts are re-verified` survived because `pathToVerifying` also returns null for closed states, so the early return looked redundant. The real difference is the wasted settings read and transition calls, now asserted with per operation call counters (`settle.success`, settling again).
- `obligation conflict swallowed instead of retried` survived because nothing simulated losing the obligation compare and set. Three tests in `settle: lost races on the obligation` now do.
- `webhook foreign references sent to settle` survived because the lookup returns NOT_FOUND anyway. The extra database read for a reference we never issued is now asserted absent.
- `checkout url allows credentials` was left in place by a run that hit a time limit and showed as PATTERN NOT FOUND on the next run. It was restored, the file checked, and the mutant rerun and killed.

| # | Rule broken | File | Result |
|---|-------------|------|--------|
| 1 | A2 credit on any provider success, ignore amount check | `lib/payments/service/settle.ts` | killed |
| 2 | credit provider total instead of attempt amount | `lib/payments/service/settle.ts` | killed |
| 3 | unknown or pending status treated as success | `lib/payments/service/settle.ts` | killed |
| 4 | receipt retry limit removed | `lib/payments/service/settle.ts` | killed |
| 5 | closed attempts are re-verified | `lib/payments/service/settle.ts` | killed |
| 6 | fee bearer always customer | `lib/payments/service/settle.ts` | killed |
| 7 | settings failure falls back to merchant | `lib/payments/service/settle.ts` | killed |
| 8 | mismatch discrepancy not recorded | `lib/payments/service/settle.ts` | killed |
| 9 | reversed discrepancy not recorded | `lib/payments/service/settle.ts` | killed |
| 10 | status flip before obligation and card (old order) | `lib/payments/service/settle.ts` | killed |
| 11 | scheduled obligation paid without passing through due | `lib/payments/transitions.ts` | killed |
| 12 | events published by the loser of a compare and set | `lib/payments/service/settle.ts` | killed |
| 13 | non reusable card saved | `lib/payments/service/settle.ts` | killed |
| 14 | card saved for any purpose | `lib/payments/service/settle.ts` | killed |
| 15 | obligation conflict swallowed instead of retried | `lib/payments/service/settle.ts` | killed |
| 16 | verifyAndSettle skips ownership check | `lib/payments/service/index.ts` | killed |
| 17 | getAttempt skips ownership check | `lib/payments/service/index.ts` | killed |
| 18 | public attempt leaks access code | `lib/payments/service/public.ts` | killed |
| 19 | amount range not enforced | `lib/payments/service/initiate.ts` | killed |
| 20 | missing limit does not block | `lib/payments/service/initiate.ts` | killed |
| 21 | foreign checkout host allowed | `lib/payments/service/initiate.ts` | killed |
| 22 | obligation owner not checked | `lib/payments/service/initiate.ts` | killed |
| 23 | in flight guard removed | `lib/payments/service/initiate.ts` | killed |
| 24 | repeat tap on initiating calls provider again | `lib/payments/service/initiate.ts` | killed |
| 25 | key details not compared by the service | `lib/payments/service/initiate.ts` | killed |
| 26 | refusal does not fail the attempt | `lib/payments/service/initiate.ts` | killed |
| 27 | saved card id accepted on initiate | `lib/payments/service/initiate.ts` | killed |
| 28 | suspended member can pay | `lib/payments/service/initiate.ts` | killed |
| 29 | webhook signature not checked | `lib/payments/service/webhook.ts` | killed |
| 30 | webhook stores everything | `lib/payments/service/webhook.ts` | killed |
| 31 | duplicate always short circuits | `lib/payments/service/webhook.ts` | killed |
| 32 | forged events not rate limited | `lib/payments/service/webhook.ts` | killed |
| 33 | oversize body accepted | `lib/payments/service/webhook.ts` | killed |
| 34 | webhook foreign references sent to settle | `lib/payments/service/webhook.ts` | killed |
| 35 | refund events marked processed now | `lib/payments/service/webhook.ts` | killed |
| 36 | checkout url allows http | `lib/payments/service/public.ts` | killed |
| 37 | checkout url allows credentials | `lib/payments/service/public.ts` | killed |
| 38 | allowed hosts fall open | `lib/payments/service/public.ts` | killed |
| 39 | event id ignores status | `lib/payments/service/webhook.ts` | killed |
