# SQL tests for AI-2 migrations

Run against a throwaway local Postgres (never a real project). Needs the `postgres` and `citext` extension.

```bash
createdb ggtest
psql -v ON_ERROR_STOP=1 -d ggtest -f tests/security/sql/00_stub.sql          # minimal stand in for the Supabase pieces
psql -v ON_ERROR_STOP=1 -d ggtest -f supabase/migrations/2001_member_verification_trigger.sql
psql -d ggtest -f tests/security/sql/10_tests.sql                              # expect only "ok:" lines
psql -v ON_ERROR_STOP=1 -d ggtest -f tests/security/sql/proposed_ai1_changes.sql   # requested AI-1 changes, not applied anywhere
psql -d ggtest -f tests/security/sql/20_proposed_tests.sql
```

`00_stub.sql` mirrors the definitions read from the God's Grace project on 2026-11-15 (members, member_roles, device_sessions, `handle_new_auth_user`, `bootstrap_owner`, column grants on `members`). If AI-1 changes those, update the stub.
Without `2001_member_verification_trigger.sql`, test V2 fails: a confirmed email never activates the member.
