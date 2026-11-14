# Component index (AI-3)

Read this before building any screen. Import from `@/components/ui` and `@/lib/motion`. Never restyle these with one off CSS. If something is missing, write a request in `docs/handoffs/ai5-to-ai3-<topic>.md`.

Gallery: `/design-gallery` (development only, ADR-008). It shows every state of every component below.

Updated: 2026-11-14, milestone M1.

## Ready

### Button (`components/ui/Button.tsx`)
```tsx
import { Button } from "@/components/ui";

<Button variant="primary" status={status} loadingLabel="Signing in" successLabel="Signed in" failureLabel="Wrong password. Try again.">
  Sign in
</Button>
```
| Prop | Values | Notes |
|------|--------|-------|
| `variant` | `primary` (black pill, default), `secondary` (white pill), `accent` (lavender), `quiet` | One primary per screen |
| `size` | `md` (48 px tall, default), `lg` (56 px) | Never below the 44 px touch target |
| `status` | `idle`, `loading`, `success`, `failure` | You set it. The button never decides it. Pass `success` only after the server confirmed |
| `loadingLabel`, `successLabel`, `failureLabel` | text | Shown and announced to screen readers. Failure text must say what happened, and whether money moved where it applies |
| `leadingIcon`, `trailingIcon` | node | Shown in `idle` only |

Behavior you can rely on: loading and success lock the button (no double submit, a submit button will not submit); failure stays pressable for retry; the loader ring appears only after 300 ms; reduced motion shows a static ring; focus stays on the button during loading.

### Motion primitives (`@/lib/motion`, `@/components/motion`)
- `useReducedMotion()`: true when the system asks for less motion.
- `useDelayedFlag(active, delayMs = 300)`: true only after `active` stayed true for the delay. Use it for any loader.
- `MOTION_MS`, `EASING`, `LOADER_DELAY_MS`: numbers that match the CSS tokens (a test keeps them in sync).
- `<LiveRegion message="..." />`: screen reader announcement. Empty message announces nothing.

### Tokens (`styles/tokens.css`)
Names are frozen in `contracts/design-tokens.md`. In Tailwind: `bg-canvas`, `bg-surface`, `text-ink`, `text-ink-muted`, `bg-accent`, `text-success`, `bg-success-surface`, `font-display`, `rounded-lg`, `shadow-md`. Spacing uses `var(--space-4)` or the normal Tailwind scale (4 px base matches). Black hero card: `<div data-surface="ink">` (sets black background, white text, and a focus ring that stays visible on black).

Rules: one accent hue; status is never color alone (icon and text too); card hairlines use `border-ink/10`, controls use `border-border`.

## Next (in this order)
Inputs (pill, floating label, phone prefix), cards, feedback (alert, toast, skeleton, empty, error, success), sheet and modal, navigation (sidebar, bottom tab bar), timeline pills, progress ring, data table that collapses to cards, then the animation catalogue, receipt printer, auth screens, marketing site.
