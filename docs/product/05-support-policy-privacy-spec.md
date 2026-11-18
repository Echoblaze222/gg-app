# Support, policy and privacy services (M5, member side)

Base: `integration` @ 80d8ea6aaef9. Status: code and tests pushed to `ai/5-product`, NOT executed (no network or CI connector in the authoring session). No screens yet.

Labels: VERIFIED = read in the contracts at the base SHA. ASSUMED = my choice, needs a check. OPEN = needs a decision.

## Protocol notes
1. Ground: contracts re-read at the base SHA. Permission names, enum values, event payloads, error codes and entity fields used here were checked against `contracts/` after the first push, and no mismatch was found.
2. Research: no outside source needed. All rules come from the contracts and the pack. Nigerian data protection timelines and consent wording are legal questions, so none are encoded.
3. Model: see the threat table.
4. Contract check: gaps are in `docs/handoffs/ai5-contract-request-support-legal.md`.

## Data access rule (all three services)
- READ through session repositories, so row level security applies.
- WRITE through server repositories, only after the service checked permission and ownership. A member can then never set `fromStaff`, a status or an `ip` by talking to the database directly. AI-1 must also make those writes server-only (request item 5).

## Threats and defenses
| Threat | Defense |
|--------|---------|
| Reply to someone else's ticket, or probe ticket ids | Ownership proven from the member's own list. Not found and not yours look the same |
| Forge a staff message | `fromStaff` is always false, written by the server |
| Flood tickets or requests | Rate limits per member (ASSUMED values, tunable) |
| NUL character in text turns a typo into a server error | Rejected at validation with a field message |
| Accept an outdated policy from a stale tab | Only the current published version of a kind can be accepted, otherwise CONFLICT with a clear message |
| Accept a draft or future version | Not found |
| Double acceptance creating duplicate evidence | Second accept returns the first acceptance, no new row, audit or event |
| Forged acceptance ip | `ip` comes from the request context and is written by the server |
| Accidental or hijacked account deletion request | Password confirmed again for `deletion` before anything else happens |
| Duplicate privacy requests | An open request of the same kind is returned instead of a new one |
| Audit or event outage blocking the member | Both are best effort, failures are reported through callbacks, the action stands |
| Internals leaking to a screen | Any unexpected error becomes INTERNAL with the request reference only |

## Behaviour notes
- Support: member replies hand a `pending_member` or `resolved` ticket back to `pending_staff` (ASSUMED workflow). A closed ticket cannot be replied to. The message and the status change are not atomic, see the handoff.
- Policy: `getCurrent` is public and returns the `draft` flag unchanged. Legal pages must show a visible needs-legal-review marker while it is true. Launch is blocked until legal review.
- Privacy: creating a request only RECORDS it. Nothing is exported, corrected or deleted by this code. Screens must say only that a person will review it.

## States for the screens (to build later)
| State | Support, policy and privacy screens |
|-------|-------------------------------------|
| Loading | Skeleton rows |
| Empty | Short helpful text, no fake items |
| Error | `error.message`, `error.action` and the reference |
| Processing | Disabled submit with progress text |
| Success | Confirmation that names what happens next, nothing more |
| Retry | Safe: validation and rate limit errors keep the typed text |

## Open items
- Staff and admin sides (reply, list, decide, publish) need contract additions, see `docs/handoffs/ai5-contract-request-product-gaps.md` items 1 to 4.
- What a deletion request does to a member who has a balance or ledger history is an owner and legal decision.
- Legal text content is not written. It must come from a qualified Nigerian lawyer.
