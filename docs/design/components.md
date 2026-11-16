# Component index (AI-3)

Read this before building any screen. Import from `@/components/ui` and `@/lib/motion`. Never restyle these with one off CSS. If something is missing, write a request in `docs/handoffs/ai5-to-ai3-<topic>.md`.

Gallery: `/design-gallery` (development only, ADR-008). It shows every state of every component below.

Updated: 2026-11-15, M3a (Dialog, StateMessage, ProgressRing, TimelinePills, Navigation, DataTable, icons added).

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

### Dialog (`components/ui/Dialog.tsx`)
```tsx
const [open, setOpen] = useState(false);
<Dialog open={open} onClose={() => setOpen(false)} title="Remove this card?" description="You can add it again later.">
  ...buttons...
</Dialog>
<Dialog open={open} onClose={close} variant="sheet" title="Choose a payment method">...</Dialog>
<Dialog open={paying} onClose={close} dismissible={false} title="Checking your payment">...</Dialog>
```
Native dialog element, so the browser traps focus, handles Escape and returns focus. `dismissible={false}` turns off Escape, the backdrop and the close button: use it while a payment is in flight. Modal is centered, `variant="sheet"` rises from the bottom. No exit animation yet and no nested dialogs. Decision: `docs/design/decisions/004-dialog-native.md`.

### StateMessage (`components/ui/StateMessage.tsx`)
```tsx
<StateMessage kind="empty" title="No payments yet" message="Your receipts will show here." action={<Button>Contribute</Button>} />
```
Kinds: `empty`, `error`, `offline`, `success`, each with its own icon. Error text must say what happened and whether money moved. Page content, not a live announcement (use Alert or Toast for events). `headingLevel` 2 or 3.

### ProgressRing (`components/ui/ProgressRing.tsx`)
```tsx
<ProgressRing value={42} label="Contribution progress" valueText="NGN 21,000 of 50,000"><span>42%</span></ProgressRing>
```
`value` 0 to 100 (clamped), `label` required, `valueText` is what screen readers hear. Children show in the middle.

### TimelinePills (`components/ui/TimelinePills.tsx`)
```tsx
<TimelinePills label="Payment progress" steps={[{ id: "1", label: "Started", state: "done" }, { id: "2", label: "Checking", state: "current" }, { id: "3", label: "Confirmed", state: "upcoming" }]} />
```
States: `done`, `current`, `upcoming`, `failed`. You map the server status to these. Each pill has an icon and hidden state text.

### Navigation (`components/ui/Navigation.tsx`)
```tsx
const pathname = usePathname(); // in a client component of the shell
<BottomTabBar items={memberItems} currentPath={pathname} label="Member" />   // phones, 2 to 5 items
<SideNav sections={[{ title: "Members", items }]} currentPath={pathname} header={<Wordmark />} footer={<SignOut />} />
```
Item: `{ href, label, icon, badge?, badgeLabel?, exact? }`. Use `exact: true` for roots such as `/app`. Active item gets `aria-current="page"`, bold text and an indicator bar. The tab bar lifts toasts above it automatically (browsers with `:has()`). Icons: `HomeIcon`, `ReceiptIcon`, `WalletIcon`, `BellIcon`, `UserIcon`, `ShieldIcon`, `UsersIcon`, `ChartIcon`, `SettingsIcon`, `HelpIcon`, `InboxIcon`, `WifiOffIcon`, `AlertTriangleIcon`, `CheckCircleIcon`. `isActivePath(current, href, exact)` is exported if you need it.

### DataTable (`components/ui/DataTable.tsx`)
```tsx
<DataTable caption="Recent payments" columns={[{ key: "receipt", header: "Receipt", cell: (r) => r.receipt, primary: true }, { key: "amount", header: "Amount", cell: (r) => r.amount, align: "end" }]} rows={rows} getRowId={(r) => r.receipt} />
```
A table from 768 px up, cards below. Caption required (`hideCaption` hides it visually). For no rows, show a StateMessage instead of an empty table.

### LinkButton (`components/ui/LinkButton.tsx`)
```tsx
<LinkButton href="/register" size="lg" variant="primary">Get started</LinkButton>
```
A navigation link drawn as a pill, same variants and sizes as Button. Use it to go to a page. Use Button for anything that changes data, because only Button has loading, success and failure states.

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
The animation catalogue (task 2), receipt printer and auth screens (task 3), then the full a11y and device pass (task 6). Details: `docs/design/m3-log.md`.
