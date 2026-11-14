# AI-3 to Integrator: root setup requests

Status after the owner authorized me on 2026-11-14.

1. **`app/layout.tsx`: attach fonts. DONE by AI-3 on `ai/3-design` (owner approved), commit "wire fonts".** `fontVariables` is on `<html>`. Checked with a webpack build using mocked Google Fonts responses: the three variable classes are on `<html>` and `--font-display-loaded`, `--font-body-loaded`, `--font-mono-loaded` are emitted. Integrator: keep this edit when merging, and run one real `next build` on Vercel because I could not download fonts here.
2. **`next.config.ts` viewTransition flag: WITHDRAWN.** I first asked for `experimental.viewTransition`. The guide shipped with the installed Next 16.4.6 says view transitions need no configuration, and TypeScript rejects the flag. Nothing to do. Open item for M3: installed `react` is 19.2.4 and does not export `ViewTransition`; I will check types and runtime before using it.
3. **`tests/setup.ts`: add `afterEach(cleanup)` from `@testing-library/react`.** Vitest runs without globals, so Testing Library does not clean up between tests. My test files call `cleanup` themselves, so this is optional.
4. **`vitest.config.mts` include list.** It covers `components/**/*.test.tsx` and `lib/**/*.test.ts`. Page level tests under `app/**` need `app/**/*.test.tsx`. Optional, needed from the auth screens milestone.
5. **Lockfile: STILL OPEN, needs the Integrator.** `package-lock.json` is not in the repo (ADR-012) and is too large for me to push through the GitHub connector. Please commit one from your own install.
6. **Gallery visibility.** `/design-gallery` returns 404 whenever `NODE_ENV` is production, which includes Vercel preview deployments. If the owner wants it on previews, tell me which flag to read and add it to `.env.example`.
