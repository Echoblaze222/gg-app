import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Button, Card, Input } from "@/components/ui";
import type { ButtonProps } from "@/components/ui";

export const metadata: Metadata = { title: "Design gallery", robots: { index: false, follow: false } };

const variants: NonNullable<ButtonProps["variant"]>[] = ["primary", "secondary", "accent", "quiet"];

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
    <main className="mx-auto grid max-w-3xl gap-10 px-4 py-10">
      <header className="grid gap-2">
        <h1 className="font-display text-4xl leading-tight">Design gallery</h1>
        <p className="text-ink-muted">Every component in every state. Hover, pressed and focus are drawn with preview attributes so they show without a pointer.</p>
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
          <Input label="Phone number" name="gallery-phone" type="tel" inputMode="tel" autoComplete="tel-national" prefix="+234" hint="We send a code by SMS." />
          <Input label="Password" name="gallery-password" type="password" autoComplete="new-password" trailing={<Button variant="quiet" type="button">Show</Button>} />
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
    </main>
  );
}
