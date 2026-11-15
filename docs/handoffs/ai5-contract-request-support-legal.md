# ai5 contract request: repository and table level items for support and legal

From: AI-5. To: Integrator, AI-1, AI-2. Base: `integration` @ 80d8ea6aaef9, contracts v1.0.0. Additive only.
Services affected: `lib/support/`, `lib/legal/`. Staff and admin methods are in `ai5-contract-request-product-gaps.md`.

1. `SupportRepository.getById(ticketId)`. Today ownership of a ticket is proven by scanning the member's own tickets, at most 5 pages of 100, failing closed. A member with more than 500 tickets cannot reply to an old one.
2. Atomic reply. A member reply should add the message and move `pending_member` or `resolved` to `pending_staff` in one repository method or a database trigger. Today these are two calls, and if the second fails the message is delivered but staff may not notice. The failure is reported through a callback.
3. Error code `SUPPORT_TICKET_CLOSED`. Replying to a closed ticket currently returns `CONFLICT` with a specific field message, because the taxonomy has no closer match.
4. `PolicyRepository.getById(id)`. Today the version is found among the published versions of all four kinds. Also a unique constraint on member and policy version in `policy_acceptances`, so two concurrent accepts cannot create duplicate evidence. The service checks first, but only the database can close the race.
5. Write rules for tables that carry trust fields. The services write these through the server role and rely on members being unable to write them directly: `support_messages.from_staff`, `support_tickets.status`, `policy_acceptances.ip`, `privacy_requests.status`. Please confirm row level security allows members to read their own rows but not insert or update these, or tell me otherwise.
6. Rate limit rule names. The services use `support_ticket_create` (5 per hour), `support_reply` (30 per hour) and `privacy_request_create` (3 per day). Please confirm the limiter accepts arbitrary rule names, and tell me the owner approved limits if they differ.
7. Public policy reads. `PolicyService.getCurrent` is public, so it reads through the server repository because there is no session. Please confirm that is acceptable, or provide a read-only repository that is safe without a session. It returns published text only, but the draft flag is included on purpose.
8. Pending members. Please confirm whether a member whose status is `pending_verification` may use `member.support.create` and `member.privacy.request`. The services do not check member status and rely on `requirePermission`.
