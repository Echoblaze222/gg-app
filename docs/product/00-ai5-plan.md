# AI-5 Plan: Product Screens, Notifications, Support, Legal

Base: `integration` @ 59b43bc49fcf (contracts v1.0.0). Branch: `ai/5-product`. Status: PLAN ONLY, no feature code yet.

## 1. Labels used
- VERIFIED: read in the repo at the SHA above.
- ASSUMED: my reading, needs a check.
- OPEN: needs an owner or Integrator decision.

## 2. Protocol (every milestone, no skipped steps)
1. Verify ground: re-read the contracts, CODEOWNERS and handoffs. Record the integration SHA.
2. Research: Next.js 16.4.6 docs in `node_modules/next/dist/docs/` (route groups, server actions, caching, forms), Supabase realtime reconnect behaviour, provider docs for the failure copy that touches money.
3. Model: state matrix per screen, invariants, threats (duplicate tap, stale cache, lost realtime event, replayed request, wrong-member data).
4. Contract check: every call goes through an interface in `contracts/services.ts`. Gaps become request files in `docs/handoffs/`, never a workaround.
5. Tests first: state reducers and realtime merge logic against test doubles that live only under `tests/`.
6. Implement one slice, small commits.
7. Verify with evidence. Lint, types, tests, build, secret scan, 360 px check. Anything I could not run is reported as NOT VERIFIED.
8. PR into `integration` using the template. Never push to `main`.

## 3. Ground truth that changed since the original brief (VERIFIED)
- Product is personal savings with withdrawal requests (ADR-005). There are no pooled cycles.
  - The brief's admin "cycle collection" card and "contributions and cycles" screen no longer apply as written.
  - Admin dashboard metrics must be re-derived (section 6).
- `contracts/routes.md` adds `/app/withdrawals`, `/app/withdrawals/new`, `/admin/withdrawals`, and renames admin users to `/admin/members`.
- Auth UI is AI-3. I own 13 member routes, 12 admin routes, 4 legal pages.
- `components/` does not exist on `integration` yet (AI-3 has not merged). `app/` has only `(marketing)` and the root layout.
- `contracts/db-types.ts` is not present yet (AI-1).
- Environment limit this session: no network in the sandbox and no CI connector. I cannot run npm, tests or build here. Every test I write is UNEXECUTED until CI runs it on the PR.

## 4. Service map (what each screen may call)
| Area | Services I call | Services I implement |
|------|-----------------|----------------------|
| Home, contributions, history | ContributionService, PaymentService.listHistory | none |
| Pay, payment methods | PaymentService | none |
| Receipt | ReceiptService | none |
| Withdrawals | PayoutService | none |
| Profile, onboarding | MemberService, PolicyService | PolicyService |
| Security | AuthService (devices, password, reauth) | none |
| Notifications | NotificationService | NotificationService |
| Support | SupportService | SupportService |
| Privacy, legal pages | PrivacyService, PolicyService | PrivacyService, PolicyService |
| Admin payments and refunds | PaymentService.requestRefund and decideRefund | none |
| Admin withdrawals | PayoutService admin methods | none |
| Admin reconciliation | ReconciliationService.run, repositories read | none |
| Admin roles | AuthorizationService | none |

## 5. Milestones (smallest useful first)
- M0: this plan plus contract request file. Gate: Integrator answers the requests that block M2 and M3.
- M1: shared screen kit in `components/features/` (state wrapper for loading, empty, error, offline, success; money formatter from kobo; money error copy keyed by `errors.ts`). Needs AI-3 component index.
- M2: notification center (service, unread count, deep links, realtime merge with dedupe and refetch on reconnect).
- M3: member home, history, receipt view (data only, AI-3 animation hooks later).
- M4: contributions plan, pay, payment methods.
- M5: withdrawals, profile, security, onboarding.
- M6: support, privacy, legal pages (drafts marked as needing legal sign off).
- M7: admin shell, dashboard, members, payments, reconciliation, withdrawals.
- M8: admin announcements, support, roles, security, audit, settings.

## 6. Admin dashboard metrics (formulas, replaces cycle metrics)
Each number needs a real source. These require count methods that do not exist yet (see handoff).
| Metric | Formula | Source |
|--------|---------|--------|
| Withdrawals awaiting review | count of payouts in status `verified` | PayoutRepository.listByStatus |
| Payments needing verification | count of attempts in `processing` or `verifying` older than the stuck threshold | PaymentAttemptRepository.listStuck |
| Failed payments to review | count of attempts `failed` in the last 7 days | PaymentAttemptRepository.listFailedOrPending |
| Open reconciliation discrepancies | count of records with status `discrepancy` | ReconciliationRepository.listOpen |
| Open support tickets | count with status `open` or `pending_staff` | SupportRepository.listByStatus |
| Recent security events | latest 10 at severity medium or above | SecurityEventRepository.list |
| Recent audit entries | latest 10 | AuditRepository.list |
A tile is hidden, not faked, if its count cannot be computed.

## 7. Per-screen definition of done
Every screen spec in `docs/product/screens/` will state: data flow, loading, processing, success, failure (what failed, whether money moved, what to do, whether retry is safe), retry, authorization (permission name from `routes.md`), audit implications, mobile at 360 px, tests.

## 8. Risks I am tracking
- Contract gaps (section in the handoff file) could stall M2 to M8 if unanswered.
- Owner rules still OPEN: missed contribution handling, refund policy, limits, BVN or NIN, manual transfer channel. Screens read these from settings and never hard code them.
- Legal: policy pages are drafts and must show a visible needs-legal-review marker. Launch is blocked on legal review (Finishing Phase section 5).
- Realtime: clients must tolerate lost and duplicate events, so realtime only triggers a refetch and never becomes the source of truth for money.
