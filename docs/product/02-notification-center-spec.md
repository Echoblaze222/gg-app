# Notification center spec (M2, service and state layer)

Status: code pushed to `ai/5-product`, tests written, NOT executed (no network or CI connector in the authoring session). CI result on the PR is the only valid evidence.

## Scope of this milestone
Included: `lib/notifications/` service (NotificationService), input schemas, pure feed state reducer, and their tests.
Not included: screens (need AI-3 components), email and SMS delivery (no provider contract), the realtime subscription wiring (needs AI-1 transport, only the reducer contract is fixed here).

## Data flow
1. AI-4 or AI-2 server code calls `notify`. Input is validated, an `in_app` row is created with the service role repository, then `notification.created` is published with ids only.
2. The member screen calls `list`, `unreadCount`, `markRead`, `markAllRead`. Each call checks `member.profile.read`, then reads through the session repositories so row level security applies. The member id comes from the verified session.
3. The browser receives `notification.created`, dispatches `event_received`, and refetches when `needsRefresh` is true.

## States (screen level, to build in M2b)
| State | Behaviour |
|-------|-----------|
| Loading | Skeleton rows, shown only until content exists |
| Empty | Short text explaining what appears here, no fake items |
| Error | `refresh_failed` shows `error.message` and `error.action` plus the reference; old list stays visible if there is one |
| Offline | Banner, list stays readable, refetch on `reconnected` |
| Success | List with unread dot, badge count from `unreadCount` |
| Processing | Mark read is local first, then confirmed by refetch |

## Failure copy
Notifications never move money. Every failure comes from `ERROR_DEFINITIONS`, so it states what failed, that money did not move, what to do and whether retry is safe.

## Authorization and audit
- Member reads: `member.profile.read`. No cross-member access, the member id is never taken from input.
- `notify` is server only. It must never be imported from client code. ASSUMED: the `server-only` package is not installed, so this is enforced by review until the Integrator confirms.
- Reads and mark read are not audited (low risk, no privileged data). `notify` is not audited here, the producing service audits its own action.

## Invariants covered by tests
- Deep links cannot leave `/app` (no host, scheme, dot segments, query).
- Member id always comes from the session.
- Unexpected errors never leak their message, and carry the request reference.
- A duplicate event never raises a second refresh. An event during a refresh is never lost. A late older response never overwrites newer data. A reconnect always refreshes.

## Open items
- Email and SMS channels: OPEN, needs a delivery contract and the owner's choice of provider.
- Retry policy for failed refetch: the reducer leaves `needsRefresh` true after a failure, so the caller must retry with capped exponential backoff and jitter (Finishing Phase 2.3). Not implemented yet.
