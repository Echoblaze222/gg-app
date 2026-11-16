# Decision Records

Short records so nobody re-argues a settled choice. Newest last. Status: accepted unless noted.

## ADR-001 Keep the existing stack
Next.js, React, TypeScript, Tailwind, Supabase Postgres, Paystack, Zod. Confirmed by the owner. Naira only.

## ADR-002 Preserve legacy history, then remove legacy code
`main` is copied to the branch `legacy-v0` (a branch, because the push tooling could not create tags). Do not delete that branch. Legacy code is removed only on `integration`. Nothing is lost. The legacy README with test credentials is deleted from `integration` and those credentials must never be valid anywhere.

## ADR-003 Money is integer kobo with a ledger
No floats. Balance is the sum of immutable ledger entries, not a column that is updated. Corrections are adjustment entries. Reason: the legacy `profiles.total_saved` was a mutable number written from the browser.

## ADR-004 One owner admin now, RBAC underneath
The owner said there is one administrator. The schema still uses roles and permissions (`owner`, `admin`, `support`, `member`) so a second admin or a support person can be added later without a migration.

## ADR-005 Contribution means personal savings with withdrawal requests
Members save on a daily, weekly or monthly schedule with any amount, and later request their money back. Each withdrawal is verified and approved by the owner. This is not a rotating (ajo or esusu) pool and not donations. Rules the owner has not answered (missed contribution handling, refunds policy, limits) are stored as configuration, not hard coded.

## ADR-006 Payment attempt states follow the AI-4 brief
`initiating`, `awaiting_authentication`, `processing`, `verifying`, `successful`, `failed`, `cancelled`, `expired`, plus `reversed` after success. `idle` is a client only state. Added `reversed` because the pack lists reversed payments as an edge case.

## ADR-007 Payout destination is copied onto the request
The bank details are snapshotted when the member requests a withdrawal so a later profile edit cannot redirect an approved payout.

## ADR-008 Component gallery route is `/design-gallery`
Next.js treats folders starting with an underscore as private, so `/_design` from the brief cannot be a route.

## ADR-009 Next.js upgraded to 16.4.6
The legacy 16.2.4 had a critical advisory (denial of service with Server Components). 16.4.6 is the patched release and builds cleanly. `@types/node` moved to 22 because Vitest 5 requires it.

## ADR-010 Proxy file name
Next.js 16 renamed `middleware` to `proxy`. `proxy.ts` is correct. It only refreshes the session and does optimistic redirects. Real authorization happens in server code through `requirePermission()`.

## ADR-011 Manual bank transfer channel is provisional
`manual_transfer` exists in `PAYMENT_CHANNELS` because the legacy app let the admin confirm transfers by hand. Owner decision pending. If dropped, it is removed in a breaking contract bump before AI-4 builds on it.

## ADR-012 First push was made without lockfile, spec pack and images
The first push to GitHub used the GitHub API, which cannot upload a 330 KB lockfile or binary images. `package-lock.json`, `RESEARCH.md`, `source-pack/`, `ai-briefs/` and `assets/` were therefore not part of it. Dependencies are exact-pinned in `package.json`, so the first `npm install` (for example on Vercel) produces a lockfile. Commit that lockfile as soon as it exists. The spec pack stays in the owner's zip files.

## ADR-013 No BVN or NIN collection
Decided by the owner on 2026-11-16: the platform does not collect BVN or NIN. No identity-number column exists in the schema and none may be added without a new ADR. Member identity rests on verified email, phone, the owner approving each withdrawal, and the payout step-up code.

## Accepted audit findings (dependencies)
After the Next.js upgrade, `npm audit` reports only moderate findings in lint tooling (`@typescript-eslint`, `minimatch`, `eslint-config-next`) and one moderate in `baseline-browser-mapping` (build time browser data). None run in production request paths. Revisit at the finishing phase dependency audit.
