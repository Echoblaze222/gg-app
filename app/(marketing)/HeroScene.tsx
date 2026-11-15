import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import { TiltScene } from "@/components/motion/TiltScene";

/**
 * Landing hero: the illustration in the middle, product cards floating at different depths around it.
 * Real facts only. The cards show states and rules from the product, never amounts, dates or user counts.
 * Below 1024 px the cards sit in a row under the illustration. From 1024 px they float around it.
 */

const z = (value: number) => ({ "--z": `${value}px` }) as CSSProperties;

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
      <path d="M4.5 10.5l3.5 3.5 7.5-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
      <rect x="4.5" y="9" width="11" height="8" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M7 9V6.5a3 3 0 016 0V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M10 6v4.5l3 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true">
      <circle cx="4.5" cy="10" r="1.8" />
      <circle cx="10" cy="10" r="1.8" />
      <circle cx="15.5" cy="10" r="1.8" />
    </svg>
  );
}

function Pill({ icon, children, dark = false }: { icon: ReactNode; children: ReactNode; dark?: boolean }) {
  return (
    <span
      className={
        dark
          ? "inline-flex items-center gap-2 rounded-full bg-ink px-3 py-1.5 text-sm font-medium text-ink-inverse"
          : "inline-flex items-center gap-2 rounded-full border border-ink/10 bg-surface px-3 py-1.5 text-sm font-medium"
      }
    >
      {icon}
      {children}
    </span>
  );
}

function SpinBadge() {
  return (
    <div aria-hidden="true" className="relative grid h-24 w-24 place-items-center">
      <svg viewBox="0 0 100 100" className="badge-spin absolute inset-0 h-full w-full">
        <defs>
          <path id="badge-circle" d="M50 50m-38 0a38 38 0 1 1 76 0a38 38 0 1 1 -76 0" />
        </defs>
        <text fontSize="9.5" fontWeight="600" letterSpacing="1.5" fill="currentColor" fontFamily="system-ui, sans-serif">
          <textPath href="#badge-circle" textLength="236" lengthAdjust="spacing">
            VERIFIED BEFORE RECORDED •
          </textPath>
        </text>
      </svg>
      <svg viewBox="0 0 20 20" width="22" height="22" fill="currentColor">
        <path d="M10 1.5l1.9 5.6 5.6 1.9-5.6 1.9L10 16.5l-1.9-5.6L2.5 9l5.6-1.9z" />
      </svg>
    </div>
  );
}

export function HeroScene() {
  return (
    <TiltScene maxTilt={7} className="mx-auto w-full max-w-5xl">
      <div className="relative">
        <div className="depth hero-art mx-auto w-full max-w-[760px] lg:w-[76%]" style={z(0)}>
          <Image
            src="/illustrations/hero-scene.webp"
            width={883}
            height={460}
            priority
            sizes="(min-width: 1024px) 760px, 100vw"
            alt="A glass piggy bank full of gold coins, with a receipt, a calendar, a shield and a phone floating around it."
            className="h-auto w-full"
          />
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3 lg:mt-0 lg:block">
          <div
            className="depth float-a float-card p-4 lg:absolute lg:left-0 lg:top-[6%] lg:w-[24%]"
            style={z(90)}
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-success-surface text-success">
                <CheckIcon />
              </span>
              <span className="font-semibold">Payment verified</span>
            </div>
            <p className="text-sm text-ink-muted">Your receipt is issued only after Paystack confirms the payment.</p>
          </div>

          <div
            className="depth float-b float-card p-4 lg:absolute lg:bottom-[4%] lg:left-[2%] lg:w-[24%]"
            style={z(60)}
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-ink-inverse">
                <LockIcon />
              </span>
              <span className="font-semibold">Card stays on Paystack</span>
            </div>
            <p className="text-sm text-ink-muted">We never see your full card number, CVV, PIN or OTP.</p>
          </div>

          <div
            className="depth float-c float-card p-4 lg:absolute lg:right-0 lg:top-[26%] lg:w-[22%]"
            style={z(110)}
          >
            <p className="mb-3 font-semibold">Contribution schedule</p>
            <div className="flex flex-wrap gap-2 lg:grid lg:justify-items-start">
              <Pill icon={<CheckIcon />}>Paid</Pill>
              <Pill icon={<ClockIcon />} dark>
                Upcoming
              </Pill>
              <Pill icon={<DotsIcon />}>Pending</Pill>
            </div>
          </div>
        </div>

        <div className="depth float-c absolute right-[10%] top-[-4%] hidden text-ink lg:block" style={z(70)}>
          <SpinBadge />
        </div>
      </div>
    </TiltScene>
  );
}
