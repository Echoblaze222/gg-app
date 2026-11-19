"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BottomTabBar, HomeIcon, Sidebar, ToastProvider } from "@/components/ui";
import type { NavItem } from "@/components/ui";
import { OfflineBanner } from "./OfflineBanner";

const BRAND = "GG Contribution";

/** Add an entry here only when its route exists. No link in this app points at a missing screen. */
const NAV = [{ href: "/app", label: "Home", icon: <HomeIcon />, exact: true }] as const;

/**
 * Layout for the member area, built on the shared Sidebar and BottomTabBar. Sidebar from 768 px, bottom tab bar below it
 * (same black current pill). Toasts sit above the tab bar. One column of content on phones.
 */
export function MemberShell({ actions, children }: { actions?: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const items: NavItem[] = NAV.map((item) => ({
    href: item.href,
    label: item.label,
    icon: item.icon,
    current: item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`),
  }));

  return (
    <ToastProvider>
      <div className="shell">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <div className="shell__sidebar">
          <Sidebar label="Main" items={items} header={<span className="shell__wordmark">{BRAND}</span>} />
        </div>
        <div className="shell__main">
          <header className="shell__top">
            <span className="shell__wordmark shell__wordmark--top">{BRAND}</span>
            <div className="shell__actions">{actions}</div>
          </header>
          <OfflineBanner />
          <main id="main" tabIndex={-1} className="shell__content">
            {children}
          </main>
        </div>
        <BottomTabBar label="Main (bottom bar)" items={items} />
      </div>
    </ToastProvider>
  );
}
