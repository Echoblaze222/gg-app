import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Button } from "@/components/ui";
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
    </main>
  );
}
