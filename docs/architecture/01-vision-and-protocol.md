# Vision and Working Protocol

## 1. Product vision (as understood from the owner)
GG Contribution is a savings platform. One owner runs it as the single administrator. Anyone can register as a member. A member saves money on a schedule (daily, weekly or monthly) with any amount they choose, the platform holds it, and the member requests it back when they need it. The owner reviews and approves each withdrawal.

Confirmed by the owner: Paystack as processor, naira only, Next.js with Supabase Postgres.

Decided: identity numbers (BVN or NIN) are not collected, see ADR-013. A member may hold at most 500,000 naira, configurable, see ADR-014. Missed contributions, refunds, reversals, the manual transfer channel and legacy user migration have accepted defaults in ADR-015.

Still open (kept configurable, never hard coded): exact minimum contribution, minimum payout, grace days and the card cooling period. The owner can overturn any default with a new ADR.

Legal flag: holding member money and paying it out on request may count as a regulated activity in Nigeria. This is not legal advice. The launch gate in `07-FINISHING-PHASE.md` section 5 stays blocking.

## 2. The method (how bugs are avoided before code exists)
Every feature goes through the same pipeline. A step is not skipped because the feature looks small.

1. **Research.** Read the pack, the legacy audit, the framework docs for the exact version, and the provider docs. Record sources.
2. **Model.** Write the domain model, the state machine and the invariants (section 3 and 4). Invariants are statements that must always be true.
3. **Threat model.** For each money or identity flow, list what an attacker, a buggy client, a duplicate request or an outage can do. Each threat gets a control and a test.
4. **Contract.** Types, Zod schemas, error codes, events and interfaces are written and frozen in `contracts/` before implementation.
5. **Test first for invariants.** The tests that prove the invariants (database level, negative cases, duplicates) are written before the code that satisfies them.
6. **Implement small.** One concern per commit, one milestone per pull request.
7. **Verify with evidence.** Type check, lint, tests, build, and for the database a run against a real PostgreSQL. Output is pasted in the pull request. No claim of done without it.
8. **Review against the checklist** in `.github/pull_request_template.md`.
9. **Record decisions** in `docs/architecture/decisions.md` (short ADRs) so nobody re-argues them.

## 3. Domain model in one page
- **Member**: a person with a profile and a role. One seeded owner role holds all permissions. The design supports more admins later without schema change.
- **Contribution plan**: a member's own schedule. Frequency daily, weekly or monthly. Amount chosen by the member, in kobo, within limits set in configuration.
- **Obligation**: one due contribution generated from a plan for a given date. States: scheduled, due, paid, missed, cancelled.
- **Payment attempt**: one try to collect money through the provider. Has a unique reference and a unique idempotency key.
- **Payment event**: the raw provider webhook, stored first, unique per provider event id.
- **Ledger entry**: an immutable credit or debit. Member balance is the sum of entries. Nothing updates or deletes a ledger row. Corrections are new adjustment rows.
- **Payout request**: a member asks for money back. Destination bank details are copied onto the request at that moment. States: requested, verified, approved, processing, paid, rejected, failed, cancelled.
- **Audit log, security event**: append only records of who did what and what looked suspicious.

## 4. Invariants (the rules that must never break)
These are enforced in the database where possible, then in the service layer, then proven by tests.

| # | Invariant | Enforced by |
|---|-----------|-------------|
| I1 | Ledger rows are never updated or deleted | No update or delete grants, plus a trigger that raises |
| I2 | Member balance equals the sum of that member's ledger entries and is never negative | Single transaction per debit with a row lock, plus a check on the computed balance |
| I3 | A confirmed payment attempt produces exactly one ledger credit | Unique constraint on payment attempt id and entry type |
| I4 | The same provider webhook event is processed once | Unique constraint on provider event id |
| I5 | A duplicate user action cannot create a second charge | Unique constraint on user id and idempotency key, unique payment reference |
| I6 | A member has at most one open payout request | Partial unique index on open statuses |
| I7 | Available balance equals balance minus open payout amounts | One database function used everywhere, never recomputed in the client |
| I8 | A member can read only their own rows. Only the server role writes ledger, payment and audit tables | Row level security on every table, tested with negative cases |
| I9 | No table holds a full card number, CVV, PIN or OTP in clear text | Schema review and a test that scans column names |
| I10 | The client never declares money state | Money writes exist only behind server code using the service role |

## 5. Money state machines (summary)
Payment attempt: `initiating`, then `awaiting_authentication` or `processing`, then `verifying`, then `successful` or `failed`. It can also end as `cancelled` or `expired`. A `successful` attempt may later become `reversed`. The names follow the AI-4 brief. Exact transitions are in `contracts/state-machines.ts`, and a contract test checks them.

Payout: `requested` to `verified` (step up check) to `approved` to `processing` to `paid`. Any early state can go to `rejected` or `cancelled`. `processing` can go to `failed`, which releases the hold.

The database enforces the same tables with a transition check, written by AI-1 in milestone 1.

## 6. Working protocol for all AIs
- Read `00-SHARED-RULES.md` first. Own paths only. No shared file edits. No contract edits except by request file.
- Every handoff is a file in `docs/handoffs/` named `<from>-to-<to>-<topic>.md` with: what I need, why, what I assumed, deadline impact.
- Contract change request: additive changes are cheap and approved by the Integrator. Breaking changes need an ADR and owner approval.
- Disagreement: the pack wins, then `RESEARCH.md`, then this document, then the owner decides.
- Stop and ask the owner when a decision cannot be undone and could go either way (for example anything that moves real money, or deletes data).

## 7. Risk register (initial)
| Risk | Impact | Mitigation |
|------|--------|-----------|
| Product rules unanswered | Wrong ledger rules | Rules live in a configuration table, not in code. Questions tracked here. |
| Legal status of holding member funds | Launch blocked | Legal review gate before launch. |
| Contracts frozen too early | Rework | Additive only changes, versioned contracts. |
| Contract drift between AIs | Integration failures | Contract tests in CI, Integrator merge order. |
| RLS mistakes | Data leak | Negative tests for every table, run in CI on a clean database. |
| Provider rate limits on due date spikes | Failed collections | Batching, queue, jitter (finishing phase). |
| Lockfile and dependency conflicts | Broken builds | All dependencies installed in Phase A, pinned. |
