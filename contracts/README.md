# Contracts

Frozen interfaces between the five workstreams. Current version: see `CONTRACT_VERSION` in `enums.ts`.

| File | Contents | Implemented by |
|------|----------|----------------|
| `enums.ts` | All enums as const tuples, money type | everyone uses |
| `state-machines.ts` | Allowed transitions for payment, payout, obligation, refund | AI-4 in code, AI-1 in database checks |
| `errors.ts` | Error code taxonomy, `AppError`, `Result` | everyone uses |
| `entities.ts` | Domain entities as camelCase types | everyone uses |
| `events.ts` | Domain event names and payloads, `EventBus` | AI-1 transport, AI-4 and AI-5 consume |
| `repositories.ts` | Repository interfaces | AI-1 |
| `services.ts` | Service interfaces | AI-2, AI-4, AI-5 |
| `schemas.ts` | Zod input schemas | everyone validates with these |
| `permissions.ts` and `permissions.md` | RBAC permission names and default roles | AI-2 enforces, AI-5 displays |
| `routes.md` | Every route, owner and caller | AI-2, AI-3, AI-4, AI-5 |
| `design-tokens.md` | Design token names | AI-3 implements |
| `env.md` | Environment variable names, no values | AI-1 validates in `lib/env.ts` |
| `db-types.ts` | Generated database types | AI-1 generates, not yet present |

## Change rules
1. You may add to a contract only by writing `docs/handoffs/<you>-contract-request-<topic>.md`. The Integrator approves, applies the change and bumps the version.
2. You may never change or delete a frozen item. Additive changes bump the minor version. Breaking changes need an ADR and owner approval and bump the major version.
3. `tests/contract/` checks that nothing is renamed or dropped. A failing contract test blocks merge.
