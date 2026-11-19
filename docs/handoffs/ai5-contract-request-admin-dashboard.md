# AI-5 contract request: admin dashboard counts

From: AI-5. To: Integrator, AI-1, AI-4. Date: 2026-11-18. Base: `integration` @ 1915e55 (contracts v1.1.0).

`AdminDashboardService` (`lib/admin/dashboard.ts`) turns the four `AdminCountsRepository` methods into the summary the admin home screen shows. It is an AI-5 internal service, not part of the frozen contract. It works against the v1.1.0 interface, but the repository is not reachable through `RepositoryProvider`, and two count methods are too loose for a dashboard.

Status words: REQUEST (needs a decision), ASSUMED (AI-5 chose it, tell us if wrong).

| # | Request | Why |
|---|---------|-----|
| D-1 | REQUEST `countAttemptsByStatus` also takes `since?: IsoTimestamp`, and the contract pins what `olderThanSeconds` means: the attempt's last status change (`updated_at`) is older than that many seconds, not its creation time. | Today the call can only return lifetime totals or an undefined age filter. The dashboard needs "stuck for more than 15 minutes" and, later, "failed today". |
| D-2 | REQUEST expose `AdminCountsRepository` next to the other V1.1 repositories (a V1.1 aggregate or `RepositoryProvider.counts()`), server role only. | Until then AI-5 injects it as an optional dependency, and without it every section shows as unavailable. |
| D-3 | REQUEST the implementation returns every status key with zero filled, as safe integers (convert bigint to number), using one indexed aggregate query per method and never listing rows. | AI-5 treats a negative, fractional or non numeric value as untrustworthy and hides that section. A zero filled record avoids the "missing means zero" assumption. |
| D-4 | ASSUMED stuck means status `initiating`, `processing` or `verifying` for longer than 900 seconds. `awaiting_authentication` is excluded because the member is on the provider page. AI-4: tell us if `listStuck` uses a different set or age, so both agree. | A number on the dashboard must match the list behind it. |
| D-5 | ASSUMED payouts awaiting approval means status `verified`, in progress means `approved` or `processing`, open means the four `OPEN_PAYOUT_STATUSES`. | Follows the payout state names in `contracts/enums.ts`. |
| D-6 | ASSUMED tickets needing staff means `open` plus `pending_staff`, waiting on the member means `pending_member`. | Follows the ticket status names. |

## What AI-5 will wire once these exist

| Hook | Needs |
|------|-------|
| `counts` dependency taken from the provider instead of injected | D-2 |
| "failed today" tile | D-1 |
