# Component index (AI-3)

Read this before building any screen. Import from `@/components/ui` and `@/lib/motion`. Never restyle these with one off CSS. If something is missing, write a request in `docs/handoffs/ai5-to-ai3-<topic>.md`.

Gallery: `/design-gallery` (development only, ADR-008). It shows every state of every component below.

Updated: 2026-11-14, milestone M2b (Alert, Skeleton, Toast added).

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

### Input (`components/ui/Input.tsx`)
```tsx
<Input label="Phone number" name="phone" type="tel" inputMode="tel" autoComplete="tel-national" prefix="+234" hint="We send a code by SMS." error={fieldErrors.phone} />
```
Props: `label` (required, real label that floats), `hint`, `error` (what is wrong and how to fix it), `prefix`, `trailing`, plus any normal input attribute and `ref`. The error shows an icon and text, sets `aria-invalid`, and is announced politely. 56 px tall, 16 px text. Spec: `docs/design/specs/input-and-card.md`.

### Card (`components/ui/Card.tsx`)
```tsx
<Card>...</Card>                       // white card
<Card tone="ink" padding="lg">...</Card> // black hero card, text is white
```
`as` can be `div`, `section` or `article`.

### Alert (`components/ui/Alert.tsx`)
```tsx
<Alert tone="error" title="Payment failed" onDismiss={() => setShown(false)}>No money left your account. Check your card details and try again.</Alert>
```
Tones: `info`, `success`, `pending`, `warning`, `error`. Each has its own icon. `error` is announced immediately, the others politely. Say what happened, what to do, and whether money moved.

### Skeleton (`components/ui/Skeleton.tsx`)
```tsx
<SkeletonGroup label="Loading your balance">
  <Skeleton shape="circle" />
  <Skeleton width="60%" />
  <Skeleton shape="block" />
</SkeletonGroup>
```
The group shows its placeholders only after 300 ms and announces its label once. Replace it with real content when data arrives. Pulses, and is static with reduced motion.

### Toast (`components/ui/Toast.tsx`)
```tsx
// once, in the app shell layout (not done yet, owner of the shell adds it):
<ToastProvider>{children}</ToastProvider>

// anywhere in a client component:
const toast = useToast();
toast.show({ tone: "success", title: "Contribution received", message: "NGN 5,000 added." });
toast.show({ tone: "error", title: "Payment failed", message: "No money left your account." }); // stays until dismissed
```
5 s default, hover or focus pauses it, errors never auto close, at most 3 visible. If the app has a bottom tab bar set `--toast-offset-bottom` on `:root` to its height so toasts sit above it. Swipe to dismiss comes later with the gesture work.

### Motion primitives (`@/lib/motion`, `@/components/motion`)
- `useReducedMotion()`: true when the system asks for less motion.
- `useDelayedFlag(active, delayMs = 300)`: true only after `active` stayed true for the delay. Use it for any loader.
- `MOTION_MS`, `EASING`, `LOADER_DELAY_MS`: numbers that match the CSS tokens (a test keeps them in sync).
- `<LiveRegion message="..." />`: screen reader announcement. Empty message announces nothing.

### Tokens (`styles/tokens.css`)
Names are frozen in `contracts/design-tokens.md`. In Tailwind: `bg-canvas`, `bg-surface`, `text-ink`, `text-ink-muted`, `bg-accent`, `text-success`, `bg-success-surface`, `font-display`, `rounded-lg`, `shadow-md`. Spacing uses `var(--space-4)` or the normal Tailwind scale (4 px base matches). Black hero card: `<div data-surface="ink">` (sets black background, white text, and a focus ring that stays visible on black).

Rules: one accent hue; status is never color alone (icon and text too); card hairlines use `border-ink/10`, controls use `border-border`.

### Dashboard building blocks (added 2026-11-19)
- `AppShell` (`components/ui/AppShell.tsx`): signed in layout. Sidebar from 1024 px, bottom tab bar below (same black active pill), top bar with an `actions` slot, skip link, offline banner, `ToastProvider` (toasts sit above the tab bar automatically). Props: `brand`, `area?`, `navLabel`, `nav: NavItem[]`, `actions?`. Add a nav entry only when its route exists.
- `NavLinks`, `NavItem { href, label, icon, exact?, badge? }`: sets `aria-current="page"` from the path.
- `ProgressRing { value 0..1, label }`: only for a real ratio with a written formula. Clamps, NaN is empty.
- `TimelinePills { items, label }`: `paid | due | overdue | upcoming | missed`, each with text and a distinct shape. Black pill for entries that need attention. Vertical on phones.
- `EmptyState { title, children, icon?, action? }` and `ErrorState { title, message, moneyLine, action, reference?, retry? }`. ErrorState requires the money line. Use `describeError()` from `lib/dashboard/describe-error.ts` to build the copy from a contract error.
- `DataTable { caption, columns, rows, rowKey, empty }`: one real table, cards below 768 px via CSS (`data-label`).
- `OfflineBanner`: announces going offline and coming back. `Icon`: 10 line icons.

## Next (in this order)
Sheet and modal, the animation catalogue, receipt printer, auth screens, marketing site.
