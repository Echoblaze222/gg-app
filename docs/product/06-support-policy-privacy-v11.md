# Support, policy and privacy V1.1 (M5b)

Base: `integration` @ 80d8ea6aaef9 plus `contracts/v1_1.ts` and `docs/handoffs/integrator-decisions-001.md`. Status: code and tests pushed to `ai/5-product`, NOT executed (no network or CI connector in the authoring session). Extends `05-support-policy-privacy-spec.md`.

Labels: VERIFIED = read in the contracts. ASSUMED = my choice, needs a check. OPEN = needs a decision.

## What was added
- Support: `getTicket`, `listMessages` (member and staff), `listForStaff`, `staffReply`, `setStatus`.
- Policy: `listUnaccepted`, `publish`.
- Privacy: `listOpen`, `decide`.

## Verified before writing
Permission names, enum values (policy kinds and order, notification types including `support_reply`, privileged roles, open payout statuses), event payloads, error codes and entity fields were checked against the contracts. See the repository check in `ai5-contract-request-v11-followups.md` item 1 for what the contracts do not yet provide.

## Design decisions
| Topic | Decision |
|-------|----------|
| Who may open a ticket | Member permission first, so members never create permission denied records. A privileged role that also holds `admin.support.read` acts as staff. A support only account has no member permission and falls through to the staff check. An expired session is returned as is, never retried |
| Probing ticket ids | A member asking for another member's ticket gets the same not found as for a missing one |
| Staff reading member data | Reads use the server repository after the permission check, and each view is audited |
| Staff reply | Written under the verified staff id with `fromStaff: true`, the ticket moves to `pending_member`, the member gets an in app notification that never contains the staff text |
| Unfinished multi step work | Message and status are not atomic. The message stands, the failure is reported, nothing is rolled back silently |
| Staff list without a status | Statuses are walked in a fixed order with a composite cursor. A forged cursor is rejected |
| Policy publish | Password confirmed again. Version names are unique per kind. Only the owner may publish with `draft: false` (ASSUMED) |
| Privacy decide | Nobody decides a request about their own account. Rejecting needs a reason. Approving a deletion needs the password again |

## Deletion approval (interim rule, OPEN for owner and legal)
Order of operations, each step safe to stop at:
1. Check permission, input, ownership of the decision, and that the request is still open.
2. Approving a deletion: confirm the password again. Nothing has changed yet.
3. Move `received` to `in_review` with a compare and set. A concurrent change is reported as a conflict.
4. Deletion only: no executor configured means refuse and stay in review. Otherwise check balance is zero, no open payout (scan fails closed), no open refund.
5. Any blocker means audit the denial, report every blocker at once, stay in review, change nothing else.
6. Anonymize (idempotent, irreversible), then mark `completed`. If the last step fails the failure is reported and deciding again anonymizes again and completes.
Creating a request still only records it. Screens must say only that a person will review it.

## Not built
Screens, the real `DeletionExecutor`, announcements, the admin member service, dashboard counts.
