# D-003 Token values

Status: proposed, owner confirms. Names are frozen elsewhere (`contracts/design-tokens.md`). Date: 2026-11-14.

| Token | Value | Contrast |
|-------|-------|----------|
| canvas / surface / surface-raised | #FAF9F6 / #FFFFFF / #FFFFFF | raised differs by shadow, not color |
| ink / ink-muted / ink-inverse | #111111 / #5C5C57 / #FFFFFF | 17.9, 6.4 on canvas |
| accent / accent-ink | #6D3FD0 / #FFFFFF | 6.1 on canvas, 6.4 white on accent |
| border (controls) | #8C8C86 | 3.4 on surface (needs 3) |
| focus-ring | #6D3FD0, #C4B0FF inside `data-surface="ink"` | 6.1 and 9.9 |
| success, pending, error, warning (+ surfaces) | #1B7A4B, #8A5300, #B3261E, #7A5B00 | 4.7 to 6.2 on their surfaces |

Decisions taken (owner may overrule):
- **C1 gradients:** none. Flat shapes only.
- **Black hero card:** `data-surface="ink"` using `ink` and `ink-inverse`, because the frozen names have no separate hero token.
- **Card hairlines:** `border-ink/10` (decoration, no contrast rule). Controls use `border-border` (3:1 rule).
- Every pair above is asserted by `components/ui/tokens.test.tsx`, and every frozen name must exist in `tokens.css`.
