# AI-5 contract request: admin member management

From: AI-5. To: Integrator, AI-1, AI-2. Date: 2026-11-16. Base: `integration` @ 29f7359 (contracts v1.1.0).

`AdminMemberService` (list, get, setStatus) is built in `lib/admin/members.ts`. It works against today's repositories, but five things are missing or unclear and one of them can leave a suspended member holding a live session.

Status words: REQUEST (needs a decision), ASSUMED (AI-5 chose it, tell us if wrong).

| # | Request | Why |
|---|---------|-----|
| M-1 | REQUEST `MemberRepositoryV11.setStatusIf(id, from, to): Promise<Member \| null>`. Updates only while the stored status is `from`, returns null otherwise. Plus a database check that rejects any status change the table in M-2 does not allow. | `setStatus(id, status)` is read then write. Two staff acting at once, or a deletion completing at the same moment, can overwrite each other. AI-5 will switch to `setStatusIf` once it exists. |
| M-2 | REQUEST add a member status transition table to `contracts/state-machines.ts`. AI-5 proposes: `pending_verification` to `active` by email verification only, `active` and `suspended` both ways by staff, `closed` final and set only by the approved deletion flow. | The contract says a transition not listed is rejected, but members have no table. AI-5 holds a local copy (`ADMIN_MEMBER_STATUS_TRANSITIONS`) limited to what staff may do. |
| M-3 | REQUEST for AI-2: `DeviceSessionRepository.revokeAll(memberId)` (the existing `revokeAllExcept` needs a session to keep), and the request check in `proxy.ts` and `lib/auth/` must reject a suspended or closed member on every request, not only at login and refresh. | After a suspension AI-5 calls an injected `revokeAllSessions`. If it fails or is not wired, the member is suspended but may keep working until the access token expires. The service raises `onSessionRevokeError` so this cannot pass silently. |
| M-4 | REQUEST `MemberRepository.list` treats `search` as a literal, case insensitive substring of name, email and phone, with `%`, `_` and `\` escaped, and returns a stable order (for example `created_at` descending then `id`) so cursors never skip or repeat rows. | Staff type the search text. A wildcard in it must not match every member. |
| M-5 | REQUEST `AuditService` accepts the actions `admin.member.view` and `admin.member.set_status` with result `denied`, and keeps `detail` (from, to, reason, refusal) readable by owner only. | Reasons are free text written by staff. |
| M-6 | ASSUMED rules for `setStatus`, all checked before any write: nobody can change their own status; nobody can change an `owner`; changing an `admin` or `support` member needs the `owner` role; only `active` to `suspended` and back is allowed, so staff cannot skip email verification or close an account. Tell us if admins may change support staff. | Least privilege. Denied attempts are audited with the reason. |
| M-7 | ASSUMED `setStatus` passes `requireReauth: true` for reactivation as well as suspension. | One permission, `admin.members.suspend`, covers both and is on the frozen reauth list. |
| M-8 | ASSUMED the member is not notified when suspended. Opening one member is audited, the list is not. | Notifying needs a text from legal and a rule on when a notice would warn a fraudster. Tell us if a notice is required. |

## What AI-5 will wire once these exist

| Service hook | Needs |
|--------------|-------|
| `setStatusIf` replacing `setStatus` | M-1 |
| `revokeAllSessions` | M-3 |
| shared transition table import | M-2 |
