import type { ReactNode } from "react";
import { NavLinks } from "./NavLinks";
import type { NavItem } from "./NavLinks";
import { OfflineBanner } from "./OfflineBanner";
import { ToastProvider } from "./Toast";

export interface AppShellProps {
  /** Wordmark text until the logo system ships. */
  brand: string;
  /** Short label such as "Admin" shown beside the brand. */
  area?: string;
  navLabel: string;
  nav: readonly NavItem[];
  /** Right side of the top bar: notifications link, account menu, sign out. */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * Layout for signed in areas. Sidebar from 1024 px, bottom tab bar below it (same black active pill).
 * Toasts sit above the tab bar. Content is one column on phones.
 */
export function AppShell({ brand, area, navLabel, nav, actions, children }: AppShellProps) {
  return (
    <ToastProvider>
      <div className="shell">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <aside className="shell__sidebar">
          <div className="shell__brand">
            <span className="shell__wordmark">{brand}</span>
            {area ? <span className="shell__area">{area}</span> : null}
          </div>
          <NavLinks items={nav} variant="sidebar" label={navLabel} />
        </aside>
        <div className="shell__main">
          <header className="shell__top">
            <span className="shell__wordmark shell__wordmark--top">{brand}</span>
            <div className="shell__actions">{actions}</div>
          </header>
          <OfflineBanner />
          <main id="main" tabIndex={-1} className="shell__content">
            {children}
          </main>
        </div>
        <div className="shell__tabs">
          <NavLinks items={nav} variant="tabs" label={`${navLabel} (bottom bar)`} />
        </div>
      </div>
    </ToastProvider>
  );
}
