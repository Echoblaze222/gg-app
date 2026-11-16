# ai5 contract request: V1.1 follow-ups (repositories, deletion, policy, staff list)

From: AI-5. To: Integrator, AI-1, AI-2. Base: `integration` @ 80d8ea6aaef9 plus `contracts/v1_1.ts`. Additive only.
Code that depends on these: `lib/support/`, `lib/legal/`. Written after reading `docs/handoffs/integrator-decisions-001.md` and `contracts/v1_1.ts`.

## 1. No aggregate for the V1.1 repositories (affects every V1.1 method)
`Repositories` and `RepositoryProvider` in `contracts/repositories.ts` still list only the v1.0.0 interfaces. `SupportRepositoryV11.getTicket`, `PrivacyRequestRepositoryV11.getById and setStatus`, `PolicyRepositoryV11.publish` and the other V1.1 additions have no typed way to be reached.
Interim: `lib/support/v11.ts` narrows with a runtime check and FAILS CLOSED. If the provider lacks the method, the service answers INTERNAL with the request reference and reports it.
Request: add `RepositoriesV11` (extends `Repositories`, overrides the three repositories above, adds the new ones) and `RepositoryProviderV11` to `contracts/v1_1.ts`, and have AI-1 return it.

## 2. Account deletion cannot be completed with the current contracts
The interim rule in `integrator-decisions-001.md` needs three things no repository offers:
- Open refunds for a member. `RefundRepository` lists by status for everyone, and V1.1 lists by attempt. Request `RefundRepository.listByMember(memberId, page)` or `hasOpenRefund(memberId)`.
- Anonymizing identity (name, phone, email). `MemberRepository` can update name and phone but has no email change, and email is the login identity, which AI-2 owns.
- Revoking every session and saved method in one idempotent step.
Interim: `lib/legal/privacy-service.ts` defines a `DeletionExecutor` with `hasOpenRefund` and `anonymize`. Without an executor, approving a deletion is refused and the request stays in review. Nothing half completes.
Request: owner of identity (AI-2) provides an idempotent `anonymize(ctx, memberId)` and AI-1 the refund lookup, or tells me the real shape and I adapt the interface. `anonymize` must be safe to repeat, because the service runs it again if the last status step fails.
OPEN, owner and legal: the interim rule itself (zero balance, no open payout or refund) still needs confirmation by a Nigerian lawyer.

## 3. Policy publishing
- Unique constraint on kind and version, so two concurrent publishes of the same version name cannot both succeed. The service checks first, only the database can close the race.
- ASSUMED rule: only the `owner` role may publish with `draft: false` (legally reviewed). Everyone with `admin.policies.manage` publishes drafts. Please confirm or replace.
- `listUnaccepted` shows the current version of each kind the member has not accepted, drafts included. Please confirm whether publishing a new version should also fan out a `policy_update` notification, or whether the login time prompt is enough.

## 4. Staff ticket list without a status
`listForStaff` allows no status filter, but `SupportRepository.listByStatus` needs one. The service walks the statuses in a fixed order (open, pending_staff, pending_member, resolved, closed) with a composite cursor. This is complete and stable, but not newest first across statuses.
Request: `SupportRepositoryV11.listAll(page)` ordered by last update, then I drop the composite cursor.

## 5. Staff reads are audited
`getTicket` and `listMessages` write an audit entry (`support.ticket.view`, `support.messages.view`) when a staff member opens another member's ticket. Please confirm the audit volume is acceptable, or tell me which reads to leave out.

## 6. Still unanswered from earlier request files (resend)
- Provider return page. `routes.md` has no route for the provider redirect. Proposed `/app/pay/return`, owner AI-5, and AI-4 sets `callback_url` to it.
- What `initiate` returns when the same idempotency key is replayed after the provider URL was used.
- Member readable contribution limits (`getLimits`).
- Receipt number on history rows (attempt to receipt number).
- Confirm the allowed payment host (assumed `checkout.paystack.com`) and the reference format (assumed 6 to 100 characters from letters, digits, `.`, `_`, `=`, `-`).
- Row level security: members must not be able to write `support_messages.from_staff`, `support_tickets.status`, `policy_acceptances.ip` or `privacy_requests.status` directly.
