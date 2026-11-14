# D-002 Fonts

Status: accepted for M1. Date: 2026-11-14.

Display: Instrument Serif (400, normal and italic). Body and UI: Geist. Mono: Geist Mono. All three exist in `next/font/google` for Next 16.4.6 (checked in the installed package data) and are self hosted, so the browser makes no request to Google.

- Instrument Serif has one weight. Headlines get contrast from size and the italic phrase, as in reference 06.
- Fonts are defined in `styles/fonts.ts`. The root `layout.tsx` (Integrator) must add `fontVariables` to `<html>`. Until then the stacks in `tokens.css` fall back to system fonts.
- Not verified: the naira sign (U+20A6) in Geist and Instrument Serif. The build container cannot download fonts. Check before money components lock. The fallback stacks include fonts that do have the glyph.
