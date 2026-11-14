# AI-3 to Integrator: root setup requests

What I need, why, what I assumed, impact. None of these stop M1. Each stops the deliverable named.

1. **`app/layout.tsx`: attach fonts.** Import `fontVariables` from `@/styles/fonts` and put it on `<html className={fontVariables}>`. Why: Instrument Serif and Geist load only when this is wired. Assumed: you own the file. Impact: marketing and auth look generic until done. Please run a full `next build` on Vercel after, because the build container I use cannot download Google fonts and I could not test it.
2. **`next.config.ts`: `experimental: { viewTransition: true }`.** Why: shared element page transitions (Next 16 guide `01-app/02-guides/view-transitions.md`). Impact: blocks M3 page transitions only.
3. **`tests/setup.ts`: add `afterEach(cleanup)` from `@testing-library/react`.** Why: Vitest runs without globals, so Testing Library does not clean up between tests and later tests see earlier renders. My test files call `cleanup` themselves for now, so this is optional.
4. **`vitest.config.mts` include list.** It covers `components/**/*.test.tsx` and `lib/**/*.test.ts`. Page level tests under `app/**` and style checks would need `app/**/*.test.tsx`. Optional, needed from M4 (auth screens).
5. **Lockfile.** `package-lock.json` is not in the repo (ADR-012). I did not commit the one my install generated. Please commit one from your own install.
6. **Gallery visibility.** `/design-gallery` returns 404 whenever `NODE_ENV` is production, which includes Vercel preview deployments. If the owner wants it on previews, tell me which flag to read and add it to `.env.example`.
