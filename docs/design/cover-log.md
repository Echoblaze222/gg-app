# AI-3 cover log

Cover for the original AI-3. Branches `ai/3-design-cover` (milestone 1) and `ai/3-design-cover-logo` (milestone 2). Newest milestone first.

## Base branch note (read first)
`integration` did not contain the design system when this cover started. The earlier AI-3 work is on `ai/3-design`, and the contracts v1.1 and integrator decisions are on `integrator/fix-foundations`. The cover branch was created from `integrator/fix-foundations` and the `ai/3-design` M2b files were carried over by copying their content (no rebase, no history rewrite). When integration is synced with main, rebase onto it as the integrator decisions describe. The milestone 2 branch starts from the milestone 1 branch, so its PR also shows milestone 1 until that PR is merged.

## How work reaches GitHub
The cover session has no git push credential (the proxy returned 403 for the repo). Commits are published through the GitHub connector as plain file commits. Their history differs from the local commits, but the file contents are the same.

## Milestone 2: logo kit
Finished
- `public/brand/`: `symbol-on-light`, `symbol-on-dark`, `symbol-mono-black`, `symbol-mono-white`, `app-icon-dark`, `app-icon-light`, `app-icon-mono` (all SVG, no gradient).
- `docs/design/brand.md`: idea, file table, wordmark rule, clear space, minimum sizes, do not list.
- Symbol overlap widened (ring centres 18.5 and 29.5) after a render at 16, 24, 32, 48 px showed the lens vanishing at 16 px. Rings still read at 16 px. `BrandSymbol` matches the files.
- `components/brand/brand.test.tsx`: files exist, labelled, no gradient, no em dash; unique clip ids; wordmark text.

Half done
- No PNG exports (180, 192, 512) and the icons are not wired into the site: `app/layout.tsx` is not AI-3's. Request is in `docs/handoffs/ai3-app-icons.md`.
- No wordmark SVG file on purpose (needs the font outlines). The lockup is the `Wordmark` component.

Decisions and why
- Name is still working (RESEARCH section 2), so the wordmark stays live text and renames in one place.
- Black app icon is the default, light icon has a hairline so it does not vanish on the off-white page.

Blocked or open
- Owner has not confirmed the symbol. It is a proposal, no earlier logo work exists in the repo.

Next three tasks
1. Missing components: modal and sheet, navigation (sidebar, bottom tab bar), timeline pills, progress ring, data table to cards, empty, error and success states.
2. Motion components: receipt printer, payment stages, login button, OTP.
3. Auth screens in `app/(auth)/`.

## Milestone 1: landing page
Finished
- `app/(marketing)/page.tsx`: nav pill, hero (serif headline with one italic phrase, black pill CTA, white pill secondary), how it works in 3 steps, trust section on a black card, organizers, FAQ, closing CTA, legal footer. Checked at 360 px and 1280 px, no horizontal scroll.
- `components/ui/LinkButton.tsx`: link drawn as a pill, reuses the `.btn` styles. Exported from `components/ui`.
- `components/brand/BrandSymbol.tsx`, `components/brand/Wordmark.tsx`: first version of the symbol and the wordmark.

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
