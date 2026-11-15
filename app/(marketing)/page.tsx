import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { TiltScene } from "@/components/motion/TiltScene";
import { Card, LinkButton } from "@/components/ui";
import { HeroScene } from "./HeroScene";

export const metadata: Metadata = {
  title: "GG Contribution | Contribute on your own schedule",
  description:
    "Make scheduled or one time contributions in naira, pay through Paystack, and get a receipt only after your payment is verified.",
};

const steps = [
  {
    n: "1",
    title: "Choose a plan",
    body: "Pick what you contribute and how often, or make a one time contribution.",
    art: { src: "/illustrations/savings-goal.webp", width: 470, height: 492 },
  },
  {
    n: "2",
    title: "Contribute",
    body: "Pay in naira on Paystack's secure page. You never type card details into our screens.",
    art: { src: "/illustrations/contribution-success.webp", width: 403, height: 756 },
  },
  {
    n: "3",
    title: "Get a verified receipt",
    body: "We confirm the payment with Paystack first. Only then do we record it and issue your receipt.",
    art: { src: "/illustrations/receipt-verified.webp", width: 733, height: 414 },
  },
];

const trust = [
  { title: "Naira only", body: "Every amount is in naira, stored as whole kobo, so there is no rounding." },
  { title: "Paystack handles card data", body: "Card details are collected on Paystack's hosted page. We never see or store your full card number, CVV, PIN or OTP." },
  { title: "Verified before recorded", body: "A payment is shown as received only after our server confirms it with Paystack. Not when you tap, not when a page loads." },
  { title: "Clear failures", body: "If a payment fails, we tell you what happened, what you can do next, and whether money may have moved." },
];

const organizers = [
  "Manage members and contribution cycles",
  "See pending, successful and failed payments in one place",
  "Reconcile payments against provider records",
  "Send announcements to members",
  "Review an audit trail of sensitive actions",
];

const faqs = [
  { q: "What currency does it use?", a: "Naira only." },
  { q: "Do you store my card details?", a: "No. Card details are entered on Paystack's hosted page. We keep only a provider token on our server, and we show you the card brand and last four digits." },
  { q: "When do I get a receipt?", a: "After the payment has been verified with Paystack. If verification is still running, we say so and tell you we will notify you." },
  { q: "What if my payment fails?", a: "You will see what happened, what to do next, and whether money may have left your account. We never show a bare 'something went wrong'." },
  { q: "How do I sign in?", a: "With your email address. We send a verification code to confirm it." },
];

function Arrow() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
      <path d="M4 10h11M10.5 5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function MarketingHomePage() {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-5 focus:py-3 focus:text-ink-inverse"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 px-4 pt-4">
        <nav
          aria-label="Main"
          className="mx-auto flex max-w-5xl items-center justify-between gap-3 rounded-full border border-ink/10 bg-surface px-4 py-2 md:px-6"
        >
          <Link href="/" aria-label="GG Contribution home" className="rounded-full">
            <Wordmark />
          </Link>
          <ul className="hidden items-center gap-6 text-sm md:flex">
            <li><a className="rounded-full px-2 py-2 hover:underline" href="#how-it-works">How it works</a></li>
            <li><a className="rounded-full px-2 py-2 hover:underline" href="#security">Security</a></li>
            <li><a className="rounded-full px-2 py-2 hover:underline" href="#organizers">For organizers</a></li>
            <li><a className="rounded-full px-2 py-2 hover:underline" href="#faq">FAQ</a></li>
          </ul>
          <LinkButton href="/login" variant="primary">Log in</LinkButton>
        </nav>
      </header>

      <main id="main">
        <section className="overflow-x-clip px-4 pb-16 pt-10 md:pt-14" aria-labelledby="hero-title">
          <div className="mx-auto grid max-w-3xl justify-items-center gap-6 text-center">
            <h1 id="hero-title" className="font-display text-[length:var(--text-display)] leading-[1.02] tracking-tight">
              Contribute on your own schedule, with a <em>receipt you can trust</em>.
            </h1>
            <p className="max-w-prose text-lg text-ink-muted">
              Make scheduled or one time contributions in naira. We confirm every payment with Paystack before we record it.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <LinkButton href="/register" size="lg" trailingIcon={<Arrow />}>Get started</LinkButton>
              <LinkButton href="#how-it-works" size="lg" variant="secondary">See how it works</LinkButton>
            </div>
          </div>
          <div className="mt-10">
            <HeroScene />
          </div>
        </section>

        <section id="how-it-works" className="mx-auto grid max-w-5xl gap-8 px-4 py-16 scroll-mt-24" aria-labelledby="how-title">
          <h2 id="how-title" className="font-display text-4xl leading-tight">How it works</h2>
          <ol className="grid gap-4 md:grid-cols-3">
            {steps.map((s) => (
              <li key={s.n}>
                <Card className="h-full">
                  <TiltScene maxTilt={9} className="mb-4 grid h-44 place-items-center">
                    <Image
                      src={s.art.src}
                      width={s.art.width}
                      height={s.art.height}
                      alt=""
                      className="depth h-44 w-auto max-w-full object-contain"
                      style={{ "--z": "30px" } as CSSProperties}
                    />
                  </TiltScene>
                  <span className="mb-4 grid h-10 w-10 place-items-center rounded-full bg-ink text-ink-inverse" aria-hidden="true">{s.n}</span>
                  <h3 className="mb-2 text-xl font-semibold">{s.title}</h3>
                  <p className="text-ink-muted">{s.body}</p>
                </Card>
              </li>
            ))}
          </ol>
        </section>

        <section id="security" className="mx-auto max-w-5xl px-4 py-16 scroll-mt-24" aria-labelledby="trust-title">
          <Card tone="ink" padding="lg">
            <h2 id="trust-title" className="mb-8 font-display text-4xl leading-tight">How your money is handled</h2>
            <dl className="grid gap-8 md:grid-cols-2">
              {trust.map((t) => (
                <div key={t.title}>
                  <dt className="mb-1 text-lg font-semibold">{t.title}</dt>
                  <dd className="text-ink-inverse/80">{t.body}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </section>

        <section id="organizers" className="mx-auto grid max-w-5xl gap-6 px-4 py-16 scroll-mt-24 md:grid-cols-2" aria-labelledby="org-title">
          <div className="grid content-start gap-3">
            <h2 id="org-title" className="font-display text-4xl leading-tight">For organizers</h2>
            <p className="text-ink-muted">Run a contribution cycle without a spreadsheet. Every sensitive action is permission checked and recorded.</p>
          </div>
          <ul className="grid gap-3">
            {organizers.map((o) => (
              <li key={o} className="flex items-start gap-3 rounded-lg border border-ink/10 bg-surface p-4">
                <svg viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true" className="mt-0.5 shrink-0 text-success">
                  <path d="M4.5 10.5l3.5 3.5 7.5-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>{o}</span>
              </li>
            ))}
          </ul>
        </section>

        <section id="faq" className="mx-auto grid max-w-3xl gap-6 px-4 py-16 scroll-mt-24" aria-labelledby="faq-title">
          <div className="flex items-end justify-between gap-6">
            <h2 id="faq-title" className="font-display text-4xl leading-tight">Questions</h2>
            <TiltScene maxTilt={10}>
              <Image
                src="/illustrations/empty-payments.webp"
                width={410}
                height={478}
                alt=""
                className="depth h-32 w-auto md:h-40"
                style={{ "--z": "30px" } as CSSProperties}
              />
            </TiltScene>
          </div>
          <div className="grid gap-3">
            {faqs.map((f) => (
              <details key={f.q} className="group rounded-lg border border-ink/10 bg-surface px-5 py-4">
                <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {f.q}
                  <span aria-hidden="true" className="text-xl transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="pb-2 pt-2 text-ink-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-20" aria-labelledby="cta-title">
          <Card tone="ink" padding="lg" className="grid gap-6 text-center">
            <h2 id="cta-title" className="font-display text-4xl leading-tight">Ready when you are</h2>
            <div className="flex flex-wrap justify-center gap-3">
              <LinkButton href="/register" size="lg" variant="secondary">Create an account</LinkButton>
            </div>
          </Card>
        </section>
      </main>

      <footer className="border-t border-ink/10 px-4 py-10">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-6">
          <Wordmark />
          <nav aria-label="Legal">
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <li><Link className="inline-block min-h-[44px] py-3 hover:underline" href="/legal/privacy">Privacy policy</Link></li>
              <li><Link className="inline-block min-h-[44px] py-3 hover:underline" href="/legal/terms">Terms</Link></li>
              <li><Link className="inline-block min-h-[44px] py-3 hover:underline" href="/legal/payment-terms">Payment terms</Link></li>
              <li><Link className="inline-block min-h-[44px] py-3 hover:underline" href="/legal/refunds">Refund policy</Link></li>
            </ul>
          </nav>
        </div>
      </footer>
    </>
  );
}
