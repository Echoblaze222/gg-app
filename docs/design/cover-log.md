# AI-3 cover log

Cover for the original AI-3. Branch `ai/3-design-cover`. Newest milestone first.

## Base branch note (read first)
`integration` did not contain the design system when this cover started. The earlier AI-3 work is on `ai/3-design`, and the contracts v1.1 and integrator decisions are on `integrator/fix-foundations`. The cover branch was created from `integrator/fix-foundations` and the `ai/3-design` M2b files were carried over by copying their content (no rebase, no history rewrite). When integration is synced with main, rebase onto it as the integrator decisions describe.

## How work reaches GitHub
The cover session has no git push credential (the proxy returned 403 for the repo). Commits are published through the GitHub connector as plain file commits on `ai/3-design-cover`. Their history differs from the local merge commit, but the file contents are the same. The first commit holds the new components, the second holds the carried over ai/3-design M2b files, the third holds the landing page, the component index and this log.

## Milestone 1: landing page
Finished
- `app/(marketing)/page.tsx`: nav pill, hero (serif headline with one italic phrase, black pill CTA, white pill secondary), how it works in 3 steps, trust section on a black card, organizers, FAQ, closing CTA, legal footer. Checked at 360 px and 1280 px, no horizontal scroll.
- `components/ui/LinkButton.tsx`: link drawn as a pill, reuses the `.btn` styles. Exported from `components/ui`.
- `components/brand/BrandSymbol.tsx`, `components/brand/Wordmark.tsx`: first version of the symbol (two overlapping rings, accent lens) and the wordmark.

Half done
- Logo system is not complete: no app icon, no files in `public/brand/`, no clear space or minimum size doc. Next milestone.

Decisions and why
- All copy uses facts confirmed in the repo (Paystack, naira only, verify before record, card data on the provider page). No statistics, no testimonials (C4).
- Hero art is a receipt with no amounts or dates, so there is nothing invented to show.
- Anchor links only in the nav, because `/how-it-works`, `/faq` and `/about` pages do not exist yet.
- Flat surfaces, no gradient or blur (C1, C6). One accent, used only in the symbol lens and focus ring.
- `/design-gallery` already returns 404 when `NODE_ENV` is production. Still to verify with a production build (task 6).

Blocked or open
- Footer links to `/legal/*` point at AI-5 routes that are not built yet.
- No security contact or DPO contact is shown, because no real address exists in the repo. Owner to supply them.
- `npm ci` fails because `package-lock.json` is out of sync (known, Integrator owns it). Locally I ran `npm install` and did not commit the lockfile.
- Google Fonts cannot be fetched in the cover sandbox, so screenshots use fallback fonts.
- Lighthouse accessibility was not run.

Next three tasks
1. Logo system: app icon, light, dark and monochrome files in `public/brand/`, clear space and minimum size doc, small size check.
2. Missing components: modal and sheet, navigation (sidebar and bottom tab bar), timeline pills, progress ring, data table to cards, empty, error and success states.
3. Motion components: receipt printer, payment stages, login button, OTP.
