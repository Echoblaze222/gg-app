# Request: database changes needed from AI-1 (AI-2 to AI-1)

Why this is a request: `ownership.md` says changes to existing tables and functions come only from AI-1. The SQL is tested on a local Postgres stand in (`tests/security/sql/`), not applied to any project.

## 1. device_sessions needs the token's session id
`device_sessions` has no link to the Supabase session, so a revoked device cannot be refused before its access token expires (ADR-6).
```sql
alter table public.device_sessions add column if not exists session_id uuid;
create unique index if not exists device_sessions_session_id_key on public.device_sessions (session_id) where session_id is not null;
create index if not exists device_sessions_member_active_idx on public.device_sessions (member_id) where revoked_at is null;
```
Nullable on purpose so existing inserts keep working. Please also expose it through the device repository (`sessionId`).
Also still needed: the `DeviceSessionRepository` contract (see `ai2-contract-request-device-session-repository.md`). The table now exists, the contract interface does not.

## 2. bootstrap_owner should refuse a second owner
It is service role only, which is good, but it can be run repeatedly for any id. Proposed replacement in `tests/security/sql/proposed_ai1_changes.sql`: serialised with an advisory lock, refuses when an owner already exists (`GG002`) or the member does not exist (`GG003`). Tested B1 to B3.

## 3. FYI, already handled by AI-2
`supabase/migrations/2001_member_verification_trigger.sql` (new objects only): activates a member when the email is confirmed or when a provider creates an already verified user. Without it no normal member ever leaves `pending_verification`. If you prefer to own it, move it into your range and keep the tests.

## 4. Things I checked and found fine
Users can update only `full_name` and `phone` on `members`; new members default to `pending_verification` and role `member`; `audit_logs`, `security_events`, `rate_limits`, `step_up_challenges` have RLS and no policy or grant, so only the service role can touch them; security definer functions are executable by `service_role` only, except `my_balance`, which reads `auth.uid()`.
