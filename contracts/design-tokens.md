# Design token names (names and scales only)

AI-3 implements the values in `styles/` and exposes them as CSS custom properties and Tailwind theme entries under exactly these names. Values are still to be confirmed by the owner (see `RESEARCH.md` 4.2 and 4.3). Names are frozen so other workstreams can reference them now.

## Color
`--color-canvas`, `--color-surface`, `--color-surface-raised`, `--color-ink`, `--color-ink-muted`, `--color-ink-inverse`, `--color-border`, `--color-accent`, `--color-accent-ink`, `--color-focus-ring`
Status: `--color-success`, `--color-success-surface`, `--color-pending`, `--color-pending-surface`, `--color-error`, `--color-error-surface`, `--color-warning`, `--color-warning-surface`
Rule: one accent hue only. Text contrast at least 4.5 to 1.

## Type
Families: `--font-display`, `--font-body`, `--font-mono`
Sizes: `--text-xs`, `--text-sm`, `--text-base`, `--text-lg`, `--text-xl`, `--text-2xl`, `--text-3xl`, `--text-4xl`, `--text-display`
Weights: `--weight-regular`, `--weight-medium`, `--weight-semibold`
Line heights: `--leading-tight`, `--leading-normal`, `--leading-relaxed`

## Spacing (4 px base)
`--space-0`, `--space-1`, `--space-2`, `--space-3`, `--space-4`, `--space-5`, `--space-6`, `--space-8`, `--space-10`, `--space-12`, `--space-16`
Touch target minimum: `--target-min` (44 px)

## Radius (one scale)
`--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`, `--radius-pill`

## Elevation
`--shadow-none`, `--shadow-sm`, `--shadow-md`, `--shadow-lg`

## Motion
Durations: `--motion-instant`, `--motion-fast`, `--motion-base`, `--motion-slow`, `--motion-deliberate`
Easings: `--ease-standard`, `--ease-enter`, `--ease-exit`, `--ease-emphasized`
Every animation honors `prefers-reduced-motion` and exposes a text announcement. No animation decides success itself and none blocks a payment action.

## Breakpoints
`--bp-sm` (360 px design floor), `--bp-md` (768 px), `--bp-lg` (1024 px), `--bp-xl` (1280 px)
