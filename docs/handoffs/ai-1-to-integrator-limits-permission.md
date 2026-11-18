# AI-1 to Integrator: new permission `admin.limits.update` (additive contract change)

**What I need.** Approve one additive change to `contracts/permissions.ts` and `contracts/permissions.md`: the permission `admin.limits.update`.

**Why.** The owner decided on 2026-11-18 (ADR-014) that members are capped at 500,000 naira and that limits must be changeable later by a permission, possibly by a trusted admin. `admin.settings.update` is too broad for that.

**What changed.**
- `PERMISSIONS` gains `admin.limits.update`. The owner holds it. The admin default role does not. Support and members do not.
- It is in `REAUTH_REQUIRED_PERMISSIONS`.
- Migration `1960_balance_limit.sql` seeds the permission and the owner mapping. The existing contract test and the database schema test keep the two in sync.

**What I assumed.**
- Server routes that change a limit call `requirePermission("admin.limits.update")`, confirm the password again, and write an audit log row. AI-3 owns that screen.
- No existing consumer breaks: nothing enumerates the permission list by count.

**Not changed.** No error code was added. A refused contribution raises `PAYMENT_AMOUNT_INVALID` with detail `member_balance_limit`. If AI-4 wants distinct copy, a new additive error code `CONTRIBUTION_LIMIT_EXCEEDED` is the next step.

**Deadline impact.** None. The change is additive.
