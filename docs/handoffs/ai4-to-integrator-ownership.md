# AI-4 to Integrator: ownership paths

What I need: updates to `docs/architecture/ownership.md` and `.github/CODEOWNERS`.

Why: `contracts/routes.md` assigns routes to AI-4 that my OWNS list does not cover, and the contract gives me services with no owned folder.

| Path | Why |
|------|-----|
| `app/api/payouts/` | `/api/payouts/*` is AI-4 in `routes.md` |
| `app/api/jobs/` | `/api/jobs/charge-due` and `/api/jobs/reconcile` are AI-4 in `routes.md` |
| `lib/payouts/` | `PayoutService` is AI-4 in `services.ts` |
| `lib/jobs/` | Charge runner and obligation generation job logic, kept separate from route files |
| `tests/payments/` | My test doubles (fake provider, in memory repositories). Rule 4 says doubles live under `tests/`, and AI-2 asked for the same for `tests/security/` |

What I assumed meanwhile: I will not create files under `app/api/payouts/`, `app/api/jobs/`, `lib/payouts/` or `lib/jobs/` until this is confirmed. Milestones M1 to M3 need none of them.

Deadline impact: needed before M4 (jobs).
