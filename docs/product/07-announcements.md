# 07 Announcements

Owner: AI-5. Code: `lib/notifications/announcements.ts`, `announcement-schemas.ts`, tests in `announcements.test.ts`. Base: `integration` @ 8fb3acf.

## What it does
- `create`: an admin or support user writes a draft. Needs `admin.announcements.manage`. The author is the signed in member.
- `publish`: publishes the draft and sends an in app notification to every active member. Needs `admin.announcements.manage` and a recent password confirmation. Resumable and idempotent per announcement and member.
- `listPublished`: members read published announcements, newest first, cursor paginated.

## Rules
- Title: 1 to 120 characters, one line. Body: 1 to 2000 characters, line breaks allowed. Plain text only. Control characters (NUL included), C1 controls and bidirectional override or isolate characters are rejected.
- The notification carries the title and a 280 character excerpt cut on whole code points. The link is built on the server as `/app/announcements/<id>`. An admin cannot choose it.
- Fan out walks active members in pages of 100, 10 deliveries at a time. The cursor is saved only after a whole page is delivered. A failed delivery stops the run with `SYSTEM_UNAVAILABLE` and the next call retries that page. A per call page limit also stops with `SYSTEM_UNAVAILABLE`, and the next call continues.
- Once every member was reached, `fanoutCompletedAt` is set and later calls return the announcement without doing anything.
- Audit: `announcement.create` and `announcement.publish` (with counts of created and already delivered). The audit write is best effort because the action has already happened.

## Threat model
| Threat | Answer |
|--------|--------|
| A non privileged user publishes | Permission is checked first. Nothing else runs on denial. |
| A stolen admin session broadcasts a phishing message | Publish asks for the password again. Text is plain, the link is fixed, screens must show text only and never turn it into links. |
| Text that reads differently from what is stored | Bidi and control characters rejected. |
| A repeated tap or a retry double notifies | Unique key per announcement and member (request A-4), plus a completed flag. |
| Crash or timeout half way | Progress cursor (request A-3), retry is safe. |
| Error text leaks internals | Unexpected errors become `INTERNAL` with the request reference only. |
| Draft leaks to members | Members read through the session repository, `listPublished` only (request A-6). |

## VERIFIED, ASSUMED, OPEN
- VERIFIED by reading `integration` @ 8fb3acf: the permission names exist, `support` holds `admin.announcements.manage`, the `AnnouncementService` interface and repository signatures are as used, the link matches `deepLinkSchema`, no announcement domain event exists (none is emitted).
- ASSUMED: route `/app/announcements/<id>` will be built by AI-5. Audience is active members only. Audit is best effort. Reauthentication on publish. Excerpt length 280.
- OPEN: all repository support in `docs/handoffs/ai5-contract-request-announcements.md` (A-1 to A-6). A single `publish` call may exceed a serverless time limit for a very large member base. A background job runner is not in the contract. Admin double submit of `create` makes two drafts. Rate limiting is not applied.
- NOT VERIFIED: no test has been run. The tests were desk checked against the code only. CI on the pull request is the evidence.
