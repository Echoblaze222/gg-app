# Spec: Dialog, StateMessage, ProgressRing, TimelinePills, Navigation, DataTable (M3a)

Shared rules: status is never color alone; every control at least 44 px; text from the frozen tokens only; reduced motion respected; nothing here decides money state (callers pass state from the server).

## Dialog (modal and sheet)
| Item | Rule |
|------|------|
| API | `open`, `onClose`, `title` (required, labels the dialog), `description`, `variant` `modal` or `sheet`, `dismissible` (default true) |
| Dismiss | Close button, Escape, backdrop click, all calling `onClose`. With `dismissible={false}` none of them work and there is no close button. Use it while a payment is in flight |
| Focus | Native: first focusable element, trapped, returned to the trigger on close |
| Sheet | Slides up from the bottom, full width on phones, bottom safe area padding |
| Motion | Enter only (fade and rise). Reduced motion removes movement |
| Scroll | Page scroll locked while open |

## StateMessage (empty, error, offline, success screens)
Icon, heading (level 2 or 3), message, optional action slot. Four kinds with four distinct icons. Error copy must say what happened and whether money moved (caller supplies the words). No live region: it is page content, not an event.

## ProgressRing
`value` 0 to 100 (clamped), `label` required. `role="progressbar"` with `aria-valuenow`, optional `valueText` for screen readers (for example "NGN 25,000 of 50,000"). Center slot for the visible number. Arc animates with the slow duration, static with reduced motion.

## TimelinePills
Ordered list of steps with state `done`, `current`, `upcoming`, `failed`. Each pill has an icon, the label, and hidden text naming the state. `current` has `aria-current="step"`. Wraps on narrow screens.

## Navigation
- `BottomTabBar` (phones, 2 to 5 items) and `SideNav` (desktop and admin, sections).
- Items: `href`, `label`, `icon`, optional `badge` count with `badgeLabel`.
- The caller passes `currentPath` (from `usePathname()`), so the components stay pure and testable. `isActivePath` matches exact or child routes; `exact` for roots like `/app`.
- Active item has `aria-current="page"`, bold label and an indicator bar, not color alone.
- Tab bar respects the bottom safe area and lifts toasts above it.

## DataTable
Real table on wide screens. Below 768 px each row becomes a card with `label: value` lines, the primary column as the card title. Explicit ARIA table roles keep the semantics when CSS changes the display. Caption required (can be visually hidden).
