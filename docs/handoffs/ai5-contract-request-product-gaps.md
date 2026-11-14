# ai5 contract request: gaps found while mapping screens to services

From: AI-5. To: Integrator. Base: `integration` @ 59b43bc49fcf, contracts v1.0.0.
All items are additive. Nothing frozen is changed or removed.
Deadline impact: items 1 to 3 block M2 to M6 of `docs/product/00-ai5-plan.md`. The rest block M7 and M8.

## Requests
1. SupportService is member-only. The repository has `listMessages`, `listByStatus` and `setStatus`, but the service has no `getTicket`, `listMessages`, staff `reply`, staff `listForStaff` or `setStatus`. Needed for `/app/support/[ticketId]` and `/admin/support`. Assumed: staff methods require `admin.support.*` permissions from `permissions.ts`.
2. PrivacyRequestRepository can create and list, but cannot move a request through `received`, `in_review`, `completed`, `rejected`. PrivacyService has no admin list or decide. Also OPEN: what an approved `deletion` request does to a member with a nonzero balance or ledger history (ledger rows are immutable, ADR-003).
3. PolicyService has `getCurrent`, `accept`, `listAcceptances`, but no way to know which current policy versions a member has not accepted yet, and no way for an admin to publish a new version. Needed for onboarding and the policy update flow.
4. There is no AnnouncementService in `services.ts`, only AnnouncementRepository. Publishing should also fan out in-app notifications. Please confirm AI-5 owns this and may add the interface.
5. No count or aggregate methods exist on the repositories used by the admin dashboard (see section 6 of the plan). Listing every row to count them would break the cursor pagination rule. Request: `count` methods for payouts by status, attempts by status and age, open reconciliation records, tickets by status.
6. MemberService has `getMe` and `updateMe` only. Admin screens need member list, detail and suspend. Question: should AI-5 call `MemberRepository` directly behind `requirePermission("admin.members.read")`, or will an admin member service be added to the contract?
7. Withdrawal screens need a bank list (code to name) and account name resolution. No contract covers this. Question: does AI-4 own it inside PayoutService, or is it a separate interface?
8. `/admin/login` is listed as owned by AI-5, but all auth logic is AI-2 (`/api/auth/*`) and the auth UI is AI-3. Assumed: AI-5 builds only the admin entry page that calls AuthService with MFA required and reuses AI-3 auth components. Please confirm.

## What I assumed in the meantime
Nothing is built on these assumptions. I am only planning against the current interfaces until you answer.
