# Changes applied to the God's Grace Supabase project (2026-11-15)

Applied by AI-2 on the owner's instruction (the developer asked for the changes to be made). Project `cbxvgkbervkatpejgdag`, which was empty (0 auth users, 0 members) at the time.

| Applied migration name | What | Source in repo |
|------------------------|------|----------------|
| `ai2_member_verification_trigger` | Activates a member when the email is confirmed, or when a provider creates an already verified user. Never touches suspended or closed members. | `supabase/migrations/2001_member_verification_trigger.sql` |
| `ai2_device_sessions_session_id` | Nullable `session_id uuid` on `device_sessions`, unique where set, plus an index for active devices per member. | `tests/security/sql/proposed_ai1_changes.sql`, part 1 |
| `ai2_bootstrap_owner_guard` | `bootstrap_owner` refuses a second owner (`GG002`) and an unknown member (`GG003`), serialised with an advisory lock. | `tests/security/sql/proposed_ai1_changes.sql`, part 2 |

The last two change objects AI-1 owns (`ownership.md`), so AI-1 should adopt them into `supabase/migrations/1000-1999_*` so a fresh database built from the repo matches this project. All three are written to be safe to run again (`if not exists`, `create or replace`, `drop trigger if exists`).

## Checked on the real project after applying

- Permissions unchanged: `bootstrap_owner` and `handle_auth_user_verified` are executable by `postgres` and `service_role` only.
- Column, unique index, active devices index and both new triggers exist. Trigger order on insert: `on_auth_user_created` then `on_auth_user_created_activate`.
- Trial run inside a transaction that was rolled back by design: unconfirmed sign up stays `pending_verification`; confirming the email gives `active` with the verified time set; a provider verified user is `active` on insert; the first owner works, a second owner and an unknown member are refused; `is_admin` and `status` in sign up metadata are ignored (only the `member` role exists).
- Afterwards 0 auth users, 0 members, 0 roles, 0 ledger accounts: the trial left nothing behind.

## Notes

- Applied migrations are recorded by the project under the names above. The repo file is numbered 2001 while the project stores its own version stamps, so the two histories do not match one to one. AI-1 owns reconciling that.
- `device_sessions.session_id` is nullable on purpose so AI-1's existing repository inserts keep working. Making it required is a later step.
- Still unproven (needs the Auth HTTP API): revoked session refused and refresh blocked (S1), MFA claims and recovery (S2), existing email signup behaviour (S3).
