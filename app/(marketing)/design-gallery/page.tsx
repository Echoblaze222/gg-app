import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  Alert,
  BellIcon,
  BottomTabBar,
  Button,
  Card,
  DataTable,
  HomeIcon,
  Input,
  ProgressRing,
  ReceiptIcon,
  SideNav,
  Skeleton,
  SkeletonGroup,
  StateMessage,
  TimelinePills,
  ToastProvider,
  UserIcon,
  WalletIcon,
} from "@/components/ui";
import type { Column, NavItem } from "@/components/ui";
import type { ButtonProps } from "@/components/ui";
import { DialogDemo, DismissibleAlertDemo, ToastDemo } from "./ClientDemos";

export const metadata: Metadata = { title: "Design gallery", robots: { index: false, follow: false } };

const variants: NonNullable<ButtonProps["variant"]>[] = ["primary", "secondary", "accent", "quiet"];

const navItems: NavItem[] = [
  { href: "/app", label: "Home", icon: <HomeIcon />, exact: true },
  { href: "/app/history", label: "History", icon: <ReceiptIcon /> },
  { href: "/app/pay", label: "Pay", icon: <WalletIcon /> },
  { href: "/app/notifications", label: "Alerts", icon: <BellIcon />, badge: 3, badgeLabel: "unread" },
  { href: "/app/profile", label: "Profile", icon: <UserIcon /> },
];

interface PaymentRow {
  receipt: string;
  date: string;
  amount: string;
  status: string;
}
const paymentRows: PaymentRow[] = [
  { receipt: "GG-000121", date: "12 Nov 2026", amount: "NGN 5,000", status: "Paid" },
  { receipt: "GG-000118", date: "05 Nov 2026", amount: "NGN 5,000", status: "Paid" },
  { receipt: "GG-000112", date: "29 Oct 2026", amount: "NGN 2,000", status: "Pending" },
];
const paymentColumns: Column<PaymentRow>[] = [
  { key: "receipt", header: "Receipt", cell: (r) => r.receipt, primary: true },
  { key: "date", header: "Date", cell: (r) => r.date },
  { key: "amount", header: "Amount", cell: (r) => r.amount, align: "end" },
  { key: "status", header: "Status", cell: (r) => r.status },
];

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <h3 className="text-sm font-medium text-ink-muted">{title}</h3>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  );
}

export default function DesignGalleryPage() {
  // Dev only (ADR-008). Production builds return a 404.
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <ToastProvider>
      <main className="mx-auto grid max-w-3xl gap-10 px-4 py-10">
        <header className="grid gap-2">
          <h1 className="font-display text-4xl leading-tight">Design gallery</h1>
          <p className="text-ink-muted">
            Every component in every state. Hover, pressed and focus are drawn with preview attributes so they show without a pointer.
          </p>
        </header>

        <section className="grid gap-6" aria-labelledby="gallery-button">
          <h2 id="gallery-button" className="text-2xl">
            Button
          </h2>

          {variants.map((variant) => (
            <div key={variant} className="grid gap-4 rounded-lg border border-ink/10 bg-surface p-4">
              <h3 className="text-lg font-medium">{variant}</h3>
              <Row title="Idle, hover, pressed, focus, disabled">
                <Button variant={variant}>Contribute</Button>
                <Button variant={variant} preview="hover">
                  Hover
                </Button>
                <Button variant={variant} preview="pressed">
                  Pressed
                </Button>
                <Button variant={variant} preview="focus">
                  Focus
                </Button>
                <Button variant={variant} disabled>
                  Disabled
                </Button>
              </Row>
              <Row title="Loading, success, failure (the parent sets these, never the button)">
                <Button variant={variant} status="loading" loadingLabel="Signing in">
                  Sign in
                </Button>
                <Button variant={variant} status="success" successLabel="Signed in">
                  Sign in
                </Button>
                <Button variant={variant} status="failure" failureLabel="Wrong password. Try again.">
                  Sign in
                </Button>
              </Row>
              <Row title="Large">
                <Button variant={variant} size="lg">
                  Get started
                </Button>
              </Row>
            </div>
          ))}

          <div data-surface="ink" className="grid gap-4 rounded-lg p-4">
            <h3 className="text-lg font-medium">On a black surface</h3>
            <Row title="Secondary and accent keep their contrast on black">
              <Button variant="secondary">Contribute</Button>
              <Button variant="secondary" preview="focus">
                Focus
              </Button>
              <Button variant="accent">Contribute</Button>
            </Row>
          </div>
        </section>

        <section className="grid gap-6" aria-labelledby="gallery-input">
          <h2 id="gallery-input" className="text-2xl">
            Input
          </h2>
          <div className="grid gap-5 rounded-lg border border-ink/10 bg-surface p-4">
            <Input label="Full name" name="gallery-name" autoComplete="name" />
            <Input label="Email" name="gallery-email" type="email" autoComplete="email" defaultValue="ada@example.com" />
            <Input label="Hover" name="gallery-hover" preview="hover" />
            <Input label="Focus" name="gallery-focus" preview="focus" />
            <Input
              label="Phone number"
              name="gallery-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              prefix="+234"
              hint="We send a code by SMS."
            />
            <Input
              label="Password"
              name="gallery-password"
              type="password"
              autoComplete="new-password"
              trailing={
                <Button variant="quiet" type="button">
                  Show
                </Button>
              }
            />
            <Input label="Amount" name="gallery-amount" inputMode="numeric" defaultValue="5000" error="Enter an amount between 1,000 and 500,000." />
            <Input label="Disabled" name="gallery-disabled" disabled defaultValue="Locked" />
          </div>
        </section>

        <section className="grid gap-6" aria-labelledby="gallery-card">
          <h2 id="gallery-card" className="text-2xl">
            Card
          </h2>
          <Card>
            <h3 className="text-lg font-medium">White card</h3>
            <p className="text-ink-muted">Groups related content on the page.</p>
          </Card>
          <Card tone="ink" padding="lg">
            <p className="text-sm text-ink-inverse/70">Your balance</p>
            <p className="font-display text-4xl">₦ 125,000</p>
            <div className="mt-4">
              <Button variant="secondary">Request money</Button>
            </div>
          </Card>
        </section>

        <section className="grid gap-6" aria-labelledby="gallery-alert">
          <h2 id="gallery-alert" className="text-2xl">
            Alert
          </h2>
          <Alert tone="info" title="Heads up">
            Contributions close at 6 pm on the last working day.
          </Alert>
          <Alert tone="success" title="Contribution received">
            NGN 5,000 was added to your balance.
          </Alert>
          <Alert tone="pending" title="Checking your payment">
            This can take a minute. Your money is safe.
          </Alert>
          <Alert tone="warning" title="Your session ends soon">
            Save your work to stay signed in.
          </Alert>
          <DismissibleAlertDemo />
        </section>

        <section className="grid gap-6" aria-labelledby="gallery-skeleton">
          <h2 id="gallery-skeleton" className="text-2xl">
            Skeleton
          </h2>
          <p className="text-sm text-ink-muted">Appears 300 ms after the page opens, then pulses. Static with reduced motion.</p>
          <SkeletonGroup label="Loading your balance" className="grid gap-3 rounded-lg border border-ink/10 bg-surface p-4">
            <div className="flex items-center gap-3">
              <Skeleton shape="circle" />
              <div className="grid flex-1 gap-2">
                <Skeleton width="60%" />
                <Skeleton width="40%" />
              </div>
            </div>
            <Skeleton shape="block" />
          </SkeletonGroup>
        </section>

        <section className="grid gap-6" aria-labelledby="gallery-toast">
          <h2 id="gallery-toast" className="text-2xl">
            Toast
          </h2>
          <p className="text-sm text-ink-muted">Hover or focus a toast to pause it. Errors stay until dismissed. At most three show at once.</p>
          <ToastDemo />
        </section>

        <section className="grid gap-6" aria-labelledby="gallery-dialog">
          <h2 id="gallery-dialog" className="text-2xl">
            Dialog and sheet
          </h2>
          <p className="text-sm text-ink-muted">Native dialog element. Try Escape, Tab, and the backdrop. The locked one ignores all of them.</p>
          <DialogDemo />
        </section>

        <section className="grid gap-6" aria-labelledby="gallery-state">
          <h2 id="gallery-state" className="text-2xl">
            State messages
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <StateMessage
                kind="empty"
                title="No payments yet"
                message="Your receipts will show here after your first contribution."
                action={<Button variant="primary">Contribute</Button>}
                headingLevel={3}
              />
            </Card>
            <Card>
              <StateMessage
                kind="error"
                title="We could not load this"
                message="Nothing was charged. Check your connection and try again."
                action={<Button variant="secondary">Try again</Button>}
                headingLevel={3}
              />
            </Card>
            <Card>
              <StateMessage kind="offline" title="You are offline" message="Your last saved balance is shown. Payments need a connection." headingLevel={3} />
            </Card>
            <Card>
              <StateMessage kind="success" title="Contribution received" message="Your receipt is ready." headingLevel={3} />
            </Card>
          </div>
        </section>

        <section className="grid gap-6" aria-labelledby="gallery-ring">
          <h2 id="gallery-ring" className="text-2xl">
            Progress ring
          </h2>
          <div className="flex flex-wrap items-center gap-8">
            <ProgressRing value={0} label="Not started">
              <span className="text-xl">0%</span>
            </ProgressRing>
            <ProgressRing value={42} label="Contribution progress" valueText="NGN 21,000 of 50,000">
              <span className="text-xl">42%</span>
            </ProgressRing>
            <ProgressRing value={100} label="Goal reached">
              <span className="text-xl">100%</span>
            </ProgressRing>
          </div>
        </section>

        <section className="grid gap-6" aria-labelledby="gallery-pills">
          <h2 id="gallery-pills" className="text-2xl">
            Timeline pills
          </h2>
          <TimelinePills
            label="Payment in progress"
            steps={[
              { id: "1", label: "Started", state: "done" },
              { id: "2", label: "Checking with the bank", state: "current" },
              { id: "3", label: "Confirmed", state: "upcoming" },
            ]}
          />
          <TimelinePills
            label="Payment that failed"
            steps={[
              { id: "1", label: "Started", state: "done" },
              { id: "2", label: "Bank declined", state: "failed" },
              { id: "3", label: "Confirmed", state: "upcoming" },
            ]}
          />
        </section>

        <section className="grid gap-6" aria-labelledby="gallery-nav">
          <h2 id="gallery-nav" className="text-2xl">
            Navigation
          </h2>
          <p className="text-sm text-ink-muted">The tab bar is fixed to the bottom of a real screen. Here it is held inside a box.</p>
          <div className="relative h-32 overflow-hidden rounded-lg border border-ink/10 [transform:translateZ(0)]">
            <BottomTabBar items={navItems} currentPath="/app/history/GG-000121" label="Member tabs" />
          </div>
          <div className="rounded-lg border border-ink/10">
            <SideNav
              label="Admin sections"
              currentPath="/app/history"
              header={<span className="font-display text-2xl">GG</span>}
              sections={[
                { title: "Member", items: navItems.slice(0, 3) },
                { title: "Account", items: navItems.slice(3) },
              ]}
              footer={<Button variant="quiet">Sign out</Button>}
            />
          </div>
        </section>

        <section className="grid gap-6" aria-labelledby="gallery-table">
          <h2 id="gallery-table" className="text-2xl">
            Data table
          </h2>
          <p className="text-sm text-ink-muted">Narrow your window below 768 px to see the rows become cards.</p>
          <DataTable caption="Recent payments" columns={paymentColumns} rows={paymentRows} getRowId={(r) => r.receipt} />
        </section>
      </main>
    </ToastProvider>
  );
}
