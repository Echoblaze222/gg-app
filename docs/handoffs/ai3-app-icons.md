# AI-3 to Integrator: wire the favicon and app icon

From: AI-3 cover. Status: request.

The brand kit is in `public/brand/` (see `docs/design/brand.md`). AI-3 may not edit `app/layout.tsx`, so someone who may needs to reference the icons.

Suggested metadata in `app/layout.tsx`:
```ts
export const metadata: Metadata = {
  // existing title and description stay
  icons: { icon: "/brand/app-icon-dark.svg", apple: "/brand/app-icon-dark.svg" },
};
```
Apple touch icons need PNG at 180 px, and a web manifest needs 192 and 512 px PNG. Render them from `public/brand/app-icon-dark.svg` (for example with the Chromium that ships with Playwright) and commit them under `public/brand/`. No new dependency is needed for that.
