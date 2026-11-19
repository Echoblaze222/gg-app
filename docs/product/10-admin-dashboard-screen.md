# 10 Admin dashboard screen

Owner: AI-5. Route: `/admin` (frozen route list, permission `admin.members.read`). Base: `integration` @ c820a4b.

The service behind it is `lib/admin/dashboard.ts` (see `09-admin-dashboard.md`).

## Files
| File | Job |
|------|-----|
| `app/(admin)/admin/page.tsx` | Server page. Builds the services, asks the loader, redirects or draws. |
| `app/(admin)/admin-gateway.ts` | The only place admin screens reach server services. Returns null instead of a fake when setup is missing. |
| `lib/admin/dashboard-page.ts` | Pure decision: redirect, blocked, failed or ready. |
| `components/features/admin/DashboardScreen.tsx` | Draws ready, blocked and failed. |
| `components/features/admin/DashboardView.tsx` | The black attention card and one card per section. |
| `components/features/admin/RefreshButton.tsx` | Reloads the numbers in place, with a loading state. |
| `components/features/OfflineNotice.tsx` | Offline state for any screen. |
| `app/(admin)/admin/loading.tsx`, `error.tsx` | Loading skeleton and last resort error. |
| `app/(admin)/layout.tsx` | Skip link, slim header, offline notice, main landmark. |

## States
| State | What the person sees |
|-------|----------------------|
| Loading | Skeleton of the black card and four cards, announced once, after 300 ms. |
| Ready | Black "Needs attention" card with the total and what makes it up, plus one card per section they may see. |
| Nothing to do | "Nothing needs attention right now." |
| One section unavailable | That card says it could not load, that no money moved, and offers a retry. The total is hidden because it would be too low. |
| Failed | What happened, what to do, "No money moved: this page only reads numbers", the reference, a retry. |
| Blocked (no permission, suspended, email not verified) | The reason, what to do, the reference, a link home. No retry, it would not help. |
| Session ended or code needed | Sent to `/login` or `/mfa`. |
| Offline | A warning at the top: what is shown is the last data that loaded. |
| Page crashed | `error.tsx`: same wording, the Next.js digest as the reference, a retry. |

## Rules followed
- No number without a source and a formula. Each stat names what it counts, and `09-admin-dashboard.md` holds the definitions.
- No placeholder cards. A section the person may not see is not drawn. A section with no data source yet is not drawn either (see Not built).
- No progress ring, because no number here is a real ratio.
- No em dash in code, copy or docs. Tests check the rendered text.
- Written for 360 px first: one column, 2 columns from 768 px, 48 px tall controls from the shared components.

## VERIFIED, ASSUMED, OPEN
- VERIFIED by reading `integration` @ c820a4b: the props of `Card`, `Alert`, `ErrorState`, `Skeleton`, `SkeletonGroup`, `Button` and `LinkButton`, the return shape of `composeAuth`, the error catalog fields, the test setup (jest-dom only, no automatic cleanup, so each test file cleans up), the vitest globs, `next.config.ts` has no special modes.
- ASSUMED: `error.tsx` receives `error` and `reset`. The repo rules say Next.js 16 may differ from what I know and ask to read `node_modules/next/dist/docs/`, which I cannot open from my environment. Everything else copies patterns already in the repo (`auth-gateway.ts`, the marketing page). Please run `next build` before merging.
- ASSUMED: the shell shows no navigation because no other admin screen exists.
- OPEN: nothing is wired to real counts yet (request D-2). In production every section shows "could not load" until AI-1 exposes the counts repository.
- NOT VERIFIED: nothing has been run, not the tests, not the build, not the page in a browser, not Lighthouse, not 360 px width. CI and a manual check are the evidence.

## Not built (and why)
The research brief describes a black card for the active cycle (collected against expected, members overdue) and cards for failed payments needing action, recent security events and recent audit entries. None has a data source in the contracts yet, so none is drawn. Requests are in `docs/handoffs/ai5-contract-request-admin-dashboard-screen.md`. Admin login (`/admin/login`), sign out and navigation to other admin screens are separate screens.
