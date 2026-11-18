import type { ReactNode } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/brand";

function BackIcon() {
  return (
    <svg viewBox="0 0 20 20" width="22" height="22" fill="none" aria-hidden="true">
      <path d="M12.5 4.5L7 10l5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export interface AuthShellProps {
  title: string;
  /** Line under the title, usually a link to the other screen. */
  subtitle: ReactNode;
  /** Where the back arrow goes. Leave out on the first screen. */
  backHref?: string;
  children: ReactNode;
}

/** Shared frame of the sign in and sign up screens: flat lavender circle, big heading, one column. */
export function AuthShell({ title, subtitle, backHref, children }: AuthShellProps) {
  return (
    <div className="auth">
      <div className="auth__wash" aria-hidden="true" />
      <div className="auth__column">
        <div className="auth__top">
          {backHref ? (
            <Link href={backHref} className="auth__back" aria-label="Back">
              <BackIcon />
            </Link>
          ) : (
            <Link href="/" aria-label="GG Contribution home" className="auth__home">
              <Wordmark />
            </Link>
          )}
        </div>
        <header className="auth__header">
          <h1 className="auth__title">{title}</h1>
          <p className="auth__subtitle">{subtitle}</p>
        </header>
        {children}
      </div>
    </div>
  );
}
