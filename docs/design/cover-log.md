# AI-3 cover log

Cover for the original AI-3. Newest milestone first.

## Rebuild note (read first)
The cover branches `ai/3-design-cover`, `ai/3-design-cover-logo` and `ai/3-design-cover-components` could not be merged into `main`: they were built on `integrator/fix-foundations` plus copied files, and conflicted with `main` after AI-1, AI-2, AI-4 and AI-5 merged there. The Integrator rebuilt the cover work on top of the current `main` as branch `ai/3-design-cover-rebuilt` by adding only the files `main` did not have (new components, brand, landing page, gallery page, styles, docs) and merging the four shared files by hand (`components/ui/index.ts`, `styles/globals.css`, `docs/design/components.md`, this log). Files that already existed on `main` and were the same were left alone. The one edit not carried over is a no-op refactor in `components/ui/tokens.test.tsx` (`4.5 - 1.5` written as `3`). Nothing here has been run by the Integrator, the first CI run on the pull request is the first check.

## How work reaches GitHub
The cover session has no git push credential. Commits are published through the GitHub connector as plain file commits.

## Milestone 3: layout components
Finished (all with tests, styles and a gallery page at `/design-gallery/components`)
- Empty, error and success states (`StateView`), modal and sheet (`Overlay`), sidebar and bottom tab bar (`Nav`), timeline pills, progress ring, data table that collapses to cards, and a small icon set.
- Parent sets loading, success and failure. No component decides success itself.

Open
- Visual check in a browser and Lighthouse accessibility were not run.
- Motion components (receipt printer, payment stages, login button, OTP) and auth screens are next.

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
- `/design-gallery` returns 404 when `NODE_ENV` is production. Still to verify with a production build.

Blocked or open
- Footer links to `/legal/*` point at AI-5 routes that are not built yet.
- No security contact or DPO contact is shown, because no real address exists in the repo. Owner to supply them.
- Google Fonts could not be fetched in the cover sandbox, so screenshots used fallback fonts.
- Lighthouse accessibility was not run.

Next three tasks
1. Motion components: receipt printer, payment stages, login button, OTP.
2. Auth screens in `app/(auth)/`.
3. Confirm the symbol with the owner, then PNG exports and wiring the icons (needs the Integrator).
