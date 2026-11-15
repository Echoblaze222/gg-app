# Brand kit (AI-3)

## Idea
Two equal rings that overlap: two people, one shared pot. The overlap is the only place the accent shows. It is not a piggy bank, has no gradient and no 3D.

## Files (`public/brand/`)
| File | Use |
|------|-----|
| `symbol-on-light.svg` | Symbol on the off-white page or a white card. Black rings, lavender overlap |
| `symbol-on-dark.svg` | Symbol on black. White rings, light lavender overlap |
| `symbol-mono-black.svg` | One colour print, stamps, fax, embossing. Everything black |
| `symbol-mono-white.svg` | One colour on a dark or photographic background. Everything white |
| `app-icon-dark.svg` | Home screen and favicon source, black tile (recommended default) |
| `app-icon-light.svg` | Light tile with a hairline edge, for stores that need a light option |
| `app-icon-mono.svg` | Monochrome tile for platforms that tint icons |

Colors are the frozen token values: ink `#111111`, accent `#6d3fd0`, accent on black `#c4b0ff`, canvas `#faf9f6`.

## Wordmark and lockup
The name "GG Contribution" is real text in the display serif (Instrument Serif), not an image. Use the `Wordmark` component. There is no wordmark SVG file on purpose: converting the text to outlines needs the font file, and the live text is sharper, translatable and read aloud by screen readers. The product name is still working and not final (RESEARCH.md section 2). When it changes, only the text in `Wordmark` changes.

```tsx
import { BrandSymbol, Wordmark } from "@/components/brand";
<Wordmark />                       // horizontal lockup, symbol then name
<Wordmark layout="name" />         // name only
<Wordmark tone="inverse" />        // on black
<BrandSymbol title="GG Contribution" /> // symbol alone gets a text name
```

## Clear space
Keep empty space around the symbol or lockup equal to half the height of one ring (the ring height is the symbol height). Nothing, including other logos, edges and photo detail, enters that space.

## Minimum size
| Item | Minimum |
|------|---------|
| Symbol alone | 24 px wide on screen (16 px works as a favicon, where the overlap fades but the two rings stay clear) |
| Horizontal lockup | 120 px wide |
| App icon | 29 px (checked at 29, 40, 60 and 120 px) |

## Do not
- Stretch, rotate, outline, add shadows, glows or gradients.
- Recolor the overlap in any other hue. Use the mono files instead.
- Put the on-light symbol on black or the reverse. Pick the matching file.
- Place the symbol on a busy photo. Use a mono file on a plain panel.
- Turn the symbol into a piggy bank, coin or any other mascot.

## Not done
- Wiring the favicon and app icon into the site needs `app/icon.*` or metadata in `app/layout.tsx`, which AI-3 may not edit. See `docs/handoffs/ai3-app-icons.md`.
- PNG exports (180, 192, 512) for the web manifest are not generated, because the build tooling to do it is not part of the repo. They can be rendered from `app-icon-dark.svg`.
