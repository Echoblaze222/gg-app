# Database tests

Run against a real PostgreSQL. They rebuild the schema from `supabase/migrations/` and exercise the invariants in
`docs/architecture/01-vision-and-protocol.md` section 4 (I1 to I10) as the real `anon`, `authenticated` and `service_role` roles.

```bash
# any disposable local PostgreSQL 14+ works, for example:
docker run --rm -d -p 54329:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=gg_test postgres:16
TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54329/gg_test npm run test:db
```

**Safety.** Every file starts by dropping the `public` schema. `helpers.ts` refuses to run unless `TEST_DATABASE_URL`
points at this machine (`localhost`, `127.0.0.1`, `::1` or a unix socket). Never point it at a hosted Supabase project.

**Supabase.** A plain PostgreSQL has no `auth` schema or API roles, so `supabase-shim.sql` adds a minimal stand in
(`auth.users`, `auth.uid()`, `anon`, `authenticated`, `service_role`). On the Supabase CLI local stack these already
exist and the shim changes nothing.

| File | Proves |
|------|--------|
| `schema.test.ts` | Enums, state machine functions and seed data match `contracts/`. Money is bigint kobo. No card, PIN, OTP, BVN or NIN column. RLS on every table. Exact browser write privileges. Function privileges. |
| `ledger.test.ts` | I1 append only, I2 balance never negative (including a forced concurrent debit), I3 one credit per payment, entry constraints. |
| `payments.test.ts` | I4 webhook replay, I5 idempotency, payment attempt and obligation state machines, plans. |
| `payouts.test.ts` | I6 one open payout (including a forced concurrent request), I7 available balance, lifecycle, frozen destination, debit safety. |
| `refunds.test.ts` | Refund eligibility and cap, lifecycle, ledger debit, balance check at completion. |
| `rls.test.ts` | I8 and I10 as each real role: own rows only, no money writes, no self promotion, server role limits. |
| `bootstrap.test.ts` | Signup creates profile, ledger anchor and role atomically. Single owner. `has_permission`. |
| `limits.test.ts` | ADR-014: 500,000 naira savings cap per member, in flight attempts counted, forced concurrent attempts, a missing cap blocks, `admin.limits.update` is owner only. |
| `append-only.test.ts` | Audit log and security events cannot be changed. Step up challenges store hashes only. |

Two `it.todo` entries mark a known gap: a payment that moves to `reversed` does not take its credit back out of the ledger.
