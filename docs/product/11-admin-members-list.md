# 11 Admin members list

Owner: AI-5. Route: `/admin/members` (frozen route list, permission `admin.members.read`). Base: `main` @ 727d889.

The service behind it is `lib/admin/members.ts` (see `08-admin-members.md`). Unlike the dashboard, this screen is wired to real data: the gateway builds the service from AI-2's real members repository (`createAuthRepositories`), the real authorization service and the real audit service.

## Files
| File | Job |
|------|-----|
| `app/(admin)/admin/members/page.tsx` | Server page. Reads `status`, `q` and `cursor` from the address, asks the loader, redirects or draws. |
| `app/(admin)/admin-gateway.ts` | Adds `getAdminMemberService()`: the real service, or null when setup is missing. |
| `lib/admin/members-page.ts` | Pure decision and mapping: redirect, blocked, failed, invalid filter or ready rows. Also `membersHref`. |
| `lib/admin/page-errors.ts` | Shared error mapping for every admin screen. The dashboard now uses it too. |
| `components/features/admin/MembersScreen.tsx`, `MembersView.tsx` | Title, search, status filters, results, paging. |
| `components/features/admin/MembersTable.tsx` | Client wrapper around AI-3's `DataTable`, which takes functions a server page cannot pass. Gets plain rows only. |
| `components/features/admin/AdminProblem.tsx` | Blocked and failed states, shared with the dashboard. |
| `components/features/admin/AdminNav.tsx` | Navigation between the admin screens that exist. |
| `app/(admin)/admin/members/loading.tsx`, `error.tsx` | Loading skeleton and last resort error for this page. |

## What it does
- Search by name or email, a status filter (All, Active, Suspended, Pending verification, Closed), 25 members a page, newest first.
- Search is a plain GET form: it works without script, and the address can be shared or bookmarked.
- Paging moves forward with an opaque cursor. There is a way back to the first page, not to the previous page, because the repository cursor only goes forward.
- Each row shows name, email, status as a word and the join date in Lagos time. Phone number and roles are deliberately not in the list. They belong on the single member screen, which is audited.

## States
| State | What the person sees |
|-------|----------------------|
| Loading | Skeleton, announced once, after 300 ms. |
| Ready | Search, filters, the table (cards on phones) and a count. |
| Empty, no filter | "No members yet". |
| Empty, with a filter | "No members match" and a Clear filters link. |
| Invalid filter | An alert with what to fix, the message on the search box, no table. |
| Failed | What happened, what to do, "No money moved", the reference, a retry. |
| Blocked | The reason, the reference, a link home, no retry. |
| Session ended or code needed | Sent to `/login` or `/mfa`. |
| Offline | The notice from the admin shell. |
| Page crashed | `error.tsx`. |

## Threat model
| Threat | Answer |
|--------|--------|
| Someone without `admin.members.read` reads members | The service checks the permission before the repository is touched. Blocked and failed pages carry no member data. |
| Search text that breaks the query | The service rejects control and bidi characters and over 100 characters. AI-2's repository escapes the term. |
| A crafted address (`status`, `cursor`) | Status and search are validated by the service. A bad cursor falls back to the first page in the repository. |
| Personal data piled up on a screen anyone can look over | The list shows no phone and no roles. |
| Error text leaks internals | Unexpected errors become `INTERNAL` with the request reference only. |
| A made up client side fetch with the service key | There is none. Everything runs on the server and the service role key never reaches the browser. |

## VERIFIED, ASSUMED, OPEN
- VERIFIED by reading `main` @ 727d889: `createAuthRepositories` has real `members.list`, `getById` and `setStatus` with a search escape helper and a stable `created_at` then `id` cursor; `composeAuth` and `createAuditService` usage; the props of `DataTable`, `Input`, `LinkButton`, `Button`, `Card`, `Alert`; that `DataTable` is a client component taking functions.
- ASSUMED: `createSupabaseAdmin()` needs no arguments (`composeAuth` calls it that way). The admin gateway builds its own repositories next to the auth module's. `searchParams` is a promise in this Next.js version (it is in 15). The same `error.tsx` assumption as the dashboard.
- OPEN: the repository search covers name and email, not phone (request M-4 asked for phone too). The single member screen does not exist yet, so rows are not links. The count of members is the page size, not a total. A total needs a count method.
- NOT VERIFIED: nothing was run, not the tests, not `next build`, not the page in a browser, not 360 px width, not Lighthouse. CI and a manual check are the evidence. Please also try it against real data: a search with a quote or a percent sign, and a very long cursor.

## Changes to files merged earlier
`lib/admin/members.ts`: the `repositories` dependency now asks only for `{ server(): { members } }`. A full `RepositoryProvider` still fits, so the existing tests are unchanged. `lib/admin/dashboard-page.ts` and `DashboardScreen.tsx` now use the shared `page-errors.ts` and `AdminProblem.tsx` with the same wording. `app/(admin)/layout.tsx` gained the navigation.

## Not built
The single member screen (`/admin/members/[id]`) with the audited view and the suspend and reactivate actions. That is the next screen.
