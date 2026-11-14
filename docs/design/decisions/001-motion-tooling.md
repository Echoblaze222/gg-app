# D-001 Motion tooling

Status: accepted for M1, owner may overrule. Date: 2026-11-14.

## Context
RESEARCH.md 4.6 wants one unique, state tied animation per action, with reduced motion fallbacks, 60 fps on low end Android, and shared element page transitions. Phase A installed `motion` 14.14.0 and Next.js 16.4.6.

## Options checked
| Option | For | Against |
|--------|-----|---------|
| CSS keyframes, inline SVG, Web Animations | No cost, only transform and opacity, simple reduced motion handling | Layout and shared element motion is awkward |
| React `<ViewTransition>` (Next 16 guide `view-transitions.md`) | Native shared element and route transitions | Needs `experimental.viewTransition: true` in `next.config.ts` (Integrator file). Safari differences |
| `motion` library (installed) | Layout animation, gestures such as swipe to dismiss and hold to confirm | Bundle cost, easy to overuse |
| Lottie | Complex illustrated sequences | Needs artwork we do not have |

## Decision
1. Default: CSS plus inline SVG for every catalogue animation.
2. `<ViewTransition>` for page and shared element transitions (config change requested in handoff 1).
3. Use `motion` only where a written spec needs gestures or layout animation (toast swipe, hold to confirm), and import it only inside the component that needs it so it is not in every page bundle.
4. No Lottie unless artwork is supplied.

## Rules every animation follows
Takes a typed `state`, never decides success, renders visible text plus a `LiveRegion` announcement, has a reduced motion rendering, loaders wait 300 ms, long animations are skippable and play once.

## Verification
Unit tests per component for each state and reduced motion. Chrome performance profile with CPU throttling on the gallery before M3 closes (not possible in the build container, see report).
