# Component index (AI-3)

Read this before building any screen. Import from `@/components/ui` and `@/lib/motion`. Never restyle these with one off CSS. If something is missing, write a request in `docs/handoffs/ai5-to-ai3-<topic>.md`.

Gallery: `/design-gallery` and `/design-gallery/components` (development only, ADR-008). They show every state of every component below.

Updated: 2026-11-15, cover milestone 3 (layout components, brand and landing page added).

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

### LinkButton (`components/ui/LinkButton.tsx`)
```tsx
<LinkButton href="/register" size="lg" variant="primary">Get started</LinkButton>
```
A navigation link drawn as a pill, same variants and sizes as Button. Use it to go to a page. Use Button for anything that changes data, because only Button has loading, success and failure states.

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

### EmptyState, ErrorState, SuccessState (`components/ui/StateView.tsx`)
```tsx
<ErrorState title="Payment failed" action={<Button>Try again</Button>}>No money left your account. Check your card details and try again.</ErrorState>
```
Full screen or inline (`compact`). Errors are announced at once, success politely, empty is plain content. Each tone has its own icon shape. Set `headingLevel` so the page outline stays correct.

### Modal and Sheet (`components/ui/Overlay.tsx`)
```tsx
<Modal open={open} onClose={close} busy={paying} busyLabel="Confirming your payment" title="Confirm contribution" footer={<Button>Confirm</Button>}>...</Modal>
<Sheet open={open} onClose={close} side="bottom" title="More">...</Sheet>   // side="end" is a right hand panel from 768 px
```
Focus is trapped and returned, Escape, backdrop and the close button dismiss, page scroll is locked. While `busy` all three dismiss paths are locked, so nobody walks away from a half finished payment. The parent sets `busy`.

### Sidebar and BottomTabBar (`components/ui/Nav.tsx`)
```tsx
const items: NavItem[] = [{ href: "/home", label: "Home", icon: <HomeIcon />, current: true }, { href: "/alerts", label: "Alerts", icon: <BellIcon />, badge: 3 }];
<Sidebar label="Main" items={items} header={<Wordmark />} />   // wide screens
<BottomTabBar label="Main" items={items} />                     // phones, at most 5 items, fixed to the bottom
```
The current page is a black pill in both. The parent decides `current` (for example from `usePathname`). Labels always show. Icons: `HomeIcon`, `WalletIcon`, `ReceiptIcon`, `BellIcon`, `UserIcon`, `ShieldIcon`, `SupportIcon`, `MenuIcon`, `CloseIcon`, `InboxIcon`.

### TimelinePills (`components/ui/TimelinePills.tsx`)
```tsx
<TimelinePills label="Contribution schedule" items={[{ id: "a", date: "5 Dec", label: "Instalment 3", status: "upcoming", current: true }]} />
```
Vertical list on phones, a row from 768 px. Status (`paid`, `upcoming`, `pending`, `overdue`) is an icon and a word on every pill. The next due pill is black. Pass `onSelect` to make pills buttons.

### ProgressRing (`components/ui/ProgressRing.tsx`)
```tsx
<ProgressRing value={42} max={60} label="Cycle collection" caption="42 of 60 paid" status="idle" />
```
Only for a real ratio. The parent sets `status` (`idle`, `loading`, `success`, `failure`). The ring never decides success from the number.

### DataTable (`components/ui/DataTable.tsx`)
```tsx
<DataTable caption="Payments" columns={columns} rows={rows} getRowId={(r) => r.id} loading={loading} error={error} onRetry={reload} emptyTitle="No payments yet" />
```
A real table from 768 px, cards below it. States: data, loading (skeleton after 300 ms), error with retry, empty. Mark one column `primary` as the card title on phones.

### Brand (`components/brand/`)
```tsx
import { BrandSymbol, Wordmark } from "@/components/brand";

<Wordmark />                    // symbol plus name
<Wordmark layout="name" />      // name only
<BrandSymbol tone="inverse" />  // on black. tones: ink, inverse, mono
```
The symbol is two overlapping rings with the accent in the overlap. Files for light, dark and monochrome, the app icons, clear space and minimum size rules are in `docs/design/brand.md` and `public/brand/`.

### Motion primitives (`@/lib/motion`, `@/components/motion`)
- `useReducedMotion()`: true when the system asks for less motion.
- `useDelayedFlag(active, delayMs = 300)`: true only after `active` stayed true for the delay. Use it for any loader.
- `MOTION_MS`, `EASING`, `LOADER_DELAY_MS`: numbers that match the CSS tokens (a test keeps them in sync).
- `<LiveRegion message="..." />`: screen reader announcement. Empty message announces nothing.

### Tokens (`styles/tokens.css`)
Names are frozen in `contracts/design-tokens.md`. In Tailwind: `bg-canvas`, `bg-surface`, `text-ink`, `text-ink-muted`, `bg-accent`, `text-success`, `bg-success-surface`, `font-display`, `rounded-lg`, `shadow-md`. Spacing uses `var(--space-4)` or the normal Tailwind scale (4 px base matches). Black hero card: `<div data-surface="ink">` (sets black background, white text, and a focus ring that stays visible on black).

Rules: one accent hue; status is never color alone (icon and text too); card hairlines use `border-ink/10`, controls use `border-border`.

## Next (in this order)
The animation catalogue (receipt printer, payment stages, login button, OTP), then the auth screens.
