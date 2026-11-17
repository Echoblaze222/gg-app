# AI-5 contract request: announcement fan out

From: AI-5. To: Integrator, AI-1. Date: 2026-11-16. Base: `integration` @ 8fb3acf (contracts v1.1.0).

Integrator decision 001 item 4 confirmed that AI-5 owns `AnnouncementService` and that publishing fans out in batches, idempotent per announcement and member. The v1.1.0 contract has the service interface but not the repository support that makes the idempotency real. Today `AnnouncementRepository.publish(id)` is unspecified for a repeat, there is no `getById`, `NotificationRepository.create` has no dedupe key, and nothing records how far a fan out got.

AI-5 built the service against injected ports (`AnnouncementFanoutPorts` in `lib/notifications/announcements.ts`). Without the ports, `publish` refuses with `SYSTEM_UNAVAILABLE`. These requests let AI-1 implement them.

Status words: REQUEST (needs a decision), ASSUMED (AI-5 chose it, tell us if wrong).

| # | Request | Why |
|---|---------|-----|
| A-1 | REQUEST `AnnouncementRepositoryV11 extends AnnouncementRepository { getById(id): Promise<Announcement \| null>; listAll(page): Promise<Page<Announcement>> }`. `listAll` includes drafts, server role only. | `publish` must tell an unknown id from a published one. The admin screen needs to list drafts. |
| A-2 | REQUEST `publish(id)` is compare and set: sets `publishedAt` only while it is null, and a repeat returns the stored row unchanged without error. | A double tap or a resumed fan out must not move the publish time. |
| A-3 | REQUEST fan out progress on the announcement: `fanout_cursor text null`, `fanout_completed_at timestamptz null`, with server only methods `getFanoutState(id)`, `saveFanoutProgress(id, cursor)`, `completeFanout(id)`. Members must not be able to read these columns. | A fan out to many members can time out or crash. The next call resumes instead of starting over. |
| A-4 | REQUEST `NotificationRepositoryV11.createIfAbsent(input & { dedupeKey: string }): Promise<{ notification: Notification; created: boolean }>` with a unique index on `(member_id, dedupe_key)` where `dedupe_key` is not null. AI-5 will use `announcement:<announcementId>`. | This is the idempotency per announcement and member. Without a database level unique key two concurrent publishes can double notify. |
| A-5 | REQUEST `MemberRepository.list` orders by `id` ascending and the cursor is stable while rows are added. | The fan out walks active members by cursor. An unstable order skips or repeats members. |
| A-6 | REQUEST row level security: a member reads only announcements with `published_at` not null, and never writes announcements or notifications. | A draft must not leak, and a member must not be able to create a notification for another member. |
| A-7 | ASSUMED publish passes `requireReauth: true` to `requirePermission`, although `admin.announcements.manage` is not in `REAUTH_REQUIRED_PERMISSIONS`. | A message to every member is a phishing risk. Tell us if you prefer to add the permission to the frozen list instead, then AI-5 removes the explicit option. |
| A-8 | ASSUMED audience is members with status `active` at the time of publishing. Pending, suspended and closed members get nothing. Members who join later see it through `listPublished`. | Matches the notification list rules. Tell us if suspended members must be told too. |

## Mapping, so AI-1 can see what AI-5 will call

| Port method | Repository support |
|-------------|--------------------|
| `getState` | A-1 `getById` plus A-3 `getFanoutState` |
| `ensurePublished` | A-2 |
| `saveProgress`, `completeFanout` | A-3 |
| `notifyIfAbsent` | A-4 with `dedupeKey = announcement:<id>`, channel `in_app`, type `announcement`, link `/app/announcements/<id>` |

AI-5 writes the small adapter in `lib/notifications/` once these exist.
