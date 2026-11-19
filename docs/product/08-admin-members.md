# 08 Admin members

Owner: AI-5. Code: `lib/admin/members.ts`, `member-schemas.ts`, tests in `members.test.ts`. Base: `integration` @ 29f7359.

## What it does
- `list`: staff with `admin.members.read` list members, filtered by status and a text search, cursor paginated.
- `get`: staff open one member. The view is audited because it shows personal data.
- `setStatus`: staff with `admin.members.suspend` and a recent password confirmation suspend or reactivate a member, with a required reason.

## Rules
- Search is trimmed, at most 100 characters, plain text. An empty search means no search.
- The reason is 3 to 500 characters on one line, plain text. Control characters, C1 controls and bidirectional override characters are rejected.
- Staff may move a member only between `active` and `suspended`. Verification and closing belong to other flows.
- Not allowed, whatever the permission: changing your own status, changing an owner, changing an admin or support member unless you are an owner. Each refusal is audited as `denied` and returns `PERMISSION_DENIED`.
- Asking for the status the member already has is a quiet success with no write and no audit row.
- After a suspension the service ends the member's sessions through an injected hook, publishes `member.status_changed`, and audits `admin.member.set_status` with from, to and reason. A failure in the audit, the event or the session hook never undoes the status change. The hook failure raises an alert callback.

## Threat model
| Threat | Answer |
|--------|--------|
| A support user suspends or reactivates someone | `admin.members.suspend` is needed, and support does not hold it. |
| A stolen admin session mass suspends members | Password confirmation on every status change. Every change and refusal is audited. |
| An admin locks out or takes over the owner | Owner is untouchable, and only an owner may change admin or support members. |
| An admin locks themselves out or suspends their own audit trail | Own status cannot be changed. |
| Staff skip email verification or close an account | Only active and suspended are reachable. |
| Search text used to match every member | Control characters rejected, length capped. Literal matching is the repository's job (request M-4). |
| Error text leaks internals | Unexpected errors become `INTERNAL` with the request reference only. |
| Suspended member keeps working | Sessions are ended after a suspension, and the request check must reject suspended members (request M-3). |

## VERIFIED, ASSUMED, OPEN
- VERIFIED by reading `integration` @ 29f7359: permission names and the reauth list, `AdminMemberService` and `MemberRepository` signatures, `member.status_changed` event, `PRIVILEGED_ROLES`, `lib/admin/` is owned by AI-5.
- ASSUMED: the rules in request M-6, M-7 and M-8. `list` reads through the server repository because the session repository is limited to the caller's own rows.
- OPEN: M-1 to M-5 in `docs/handoffs/ai5-contract-request-admin-members.md`. Two staff acting on the same member at once can overwrite each other until M-1 exists. The member is not told about a suspension.
- NOT VERIFIED: no test has been run. The tests were desk checked against the code only. CI on the pull request is the evidence.

## Not in this PR
The admin dashboard counts logic. It needs the V1.1 repository aggregate that does not exist yet.
