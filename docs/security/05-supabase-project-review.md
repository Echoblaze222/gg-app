# God's Grace Supabase project review (2026-11-15)

Project `cbxvgkbervkatpejgdag` (God's Grace, eu-west-1), accessed through the Supabase connector. Only read queries and the security advisor were run. Nothing was changed. The project is empty (0 auth users, 0 sessions, 0 members) and already has the rebuilt schema.

## What was verified from the live database

| Area | Finding |
|------|---------|
| Profile creation (legacy finding L3) | Fixed. `handle_new_auth_user` takes only `full_name` from metadata (trimmed, capped), sets status `pending_verification`, role `member`, never reads `is_admin`, balances or roles. Phone is not copied from metadata. |
| Self edits | `authenticated` can update only `full_name` and `phone` on `members` (column grants plus own row policy). Status, email and roles cannot be changed by a user. |
| Sensitive tables | `audit_logs`, `security_events`, `rate_limits`, `step_up_challenges` have RLS and no policy or grant, so only the service role can read or write. This is intended. The advisor lists them as INFO. |
| Security definer functions | Executable by `service_role` and `postgres` only, except `my_balance`, which uses `auth.uid()`. The advisor warns about it. It is intended. |
| Permission check | `has_permission` requires the member to be `active`. |
| Advisor | No errors. `citext` in the `public` schema is a warning for AI-1 to decide on. |

## Gaps found

1. **No path from `pending_verification` to `active`** for normal members. Only `bootstrap_owner` activates. Result: every member would be refused. Fixed by `supabase/migrations/2001_member_verification_trigger.sql` (tested locally, 6 of 6 breaks caught).
2. **`device_sessions` has no `session_id`**, so per device revocation cannot work as designed. Requested from AI-1.
3. **`bootstrap_owner` can be re-run**, adding owners. Requested guard from AI-1.

See `docs/handoffs/ai2-request-to-ai1-db-changes.md`.

## What this access could not prove

The connector runs SQL only. The sandbox cannot reach `supabase.co` over HTTP, so the behaviours that depend on the Auth HTTP API are still unproven: S1 (revoked session refused, refresh blocked), S2 (aal2 claim, more than one verified factor, recovery), S3 (does signing up an existing email reveal it). They need a script run from a machine with network access to the project, using its URL and publishable key. I can write that script.

## Method

The migration was tested on a local Postgres 16 stand in built from the definitions read here (`tests/security/sql/00_stub.sql`). The stand in is an approximation of Supabase, not Supabase itself, so the migration still needs to run once against the real project by whoever owns it.
