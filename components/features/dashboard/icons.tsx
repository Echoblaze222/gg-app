import type { ReactNode } from "react";
import { BellIcon, HomeIcon, InboxIcon, WalletIcon } from "@/components/ui";

export type IconName = "home" | "bell" | "inbox" | "card" | "logout" | "refresh" | "wifi-off";

function Base({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className}>
      {children}
    </svg>
  );
}

/**
 * Icons the dashboard needs. The shared set in components/ui covers home, bell, inbox and wallet; the three below (logout,
 * refresh, wifi-off) are drawn here in the same style until they move into the shared set. Always decorative: the text next to them carries the meaning.
 */
export function Icon({ name, className }: { name: IconName; className?: string }) {
  switch (name) {
    case "home":
      return <HomeIcon className={className} />;
    case "bell":
      return <BellIcon className={className} />;
    case "inbox":
      return <InboxIcon className={className} />;
    case "card":
      return <WalletIcon className={className} />;
    case "logout":
      return (
        <Base className={className}>
          <path d="M10 4H6.5A1.5 1.5 0 005 5.5v13A1.5 1.5 0 006.5 20H10" />
          <path d="M15 8l4 4-4 4" />
          <path d="M19 12H9" />
        </Base>
      );
    case "refresh":
      return (
        <Base className={className}>
          <path d="M19 12a7 7 0 10-2.1 5" />
          <path d="M19 6v6h-6" />
        </Base>
      );
    case "wifi-off":
      return (
        <Base className={className}>
          <path d="M3 3l18 18" />
          <path d="M7 11.5a8 8 0 013.5-1.9" />
          <path d="M15 10.2a8 8 0 012.5 1.4" />
          <path d="M9.5 15a4.5 4.5 0 013-1" />
          <path d="M12 19v.01" />
        </Base>
      );
  }
}
