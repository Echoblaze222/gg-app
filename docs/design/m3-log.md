# AI-3 log, M3a (2026-11-15)

Branch: `ai/3-design-m3`, created from `integration` because `ai/3-design` could not be rebased cleanly. The only conflict was `docs/design/components.md`: the cover AI had carried over my M2b commits by copying files, and its index was a superset of mine. Checked file by file that nothing on `ai/3-design` was missing from `integration`, so `ai/3-design` has no unique content left. Do not revive it.

## Changed
Cover log task 1 (missing components), all in `components/ui/` with tests and styles under `styles/components/`:
- `Dialog` (modal and sheet, native `<dialog>`, `dismissible` flag for payments in flight)
- `StateMessage` (empty, error, offline, success)
- `ProgressRing`, `TimelinePills`
- `BottomTabBar`, `SideNav`, `isActivePath`
- `DataTable` (table from 768 px, cards below, explicit ARIA roles)
- `icons.tsx` (14 stroke icons)
- Gallery sections and live demos for each. Component index updated.
- Decision D-004 (native dialog) and spec `docs/design/specs/overlays-nav-data.md`.

## Verification
- typecheck and lint clean, 763 tests pass (36 files).
- Mutation checks, each caught by a test: removing the non-dismissible Escape block, backdrop closing when not dismissible, active path matching `/app/historyx` for `/app/history`, no clamping in ProgressRing, missing `data-label` in DataTable.
- Dev server renders `/design-gallery` with every new section (HTTP 200, no errors in the log). Production build compiles and the gallery stays out of production. Compiled CSS contains the new rules.

## Not verified
- Native dialog behavior in a real browser: Escape, focus trap, focus return, backdrop click. jsdom has no `showModal()`, so tests use a stand-in. Check on a real phone first.
- Tab bar and toast offset on a real device (the offset relies on `:has()`), 360 px layout of the new components, contrast of drawn states in a browser, axe, Lighthouse, 60 fps.
- Naira sign in the fonts, real font download, `ViewTransition` availability (react 19.2.4 does not export it).

## Risks
- No dialog exit animation yet and no nested dialogs.
- Not all icon paths were checked visually (no browser). Look at them in the gallery.

## Next (from the cover log, in order)
2. Animation catalogue: one unique, state tied animation per action (login, signup, payment stages, receipt printer), each with reduced motion rendering and a screen reader announcement.
3. Auth screens (`app/(auth)/`) from reference 07, calling AI-2 interfaces from `contracts/`; receipt printer.
Then the marketing leftovers and task 6: production gallery 404 check, 360 px and a11y pass on a real device.
