"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";
import type { IconName } from "./icons";
import { cx } from "./cx";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Marks the link active only on an exact match (use for the home route). */
  exact?: boolean;
  /** Small count shown as a badge, for example unread notifications. Omit when unknown. */
  badge?: number;
}

/** The black pill marks the current page. Same list feeds the sidebar (desktop) and the bottom tab bar (mobile). */
export function NavLinks({ items, variant, label }: { items: readonly NavItem[]; variant: "sidebar" | "tabs"; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className={cx("nav", `nav--${variant}`)}>
      <ul className="nav__list">
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link href={item.href} className="nav__link" aria-current={active ? "page" : undefined}>
                <Icon name={item.icon} className="nav__icon" />
                <span>{item.label}</span>
                {item.badge ? <span className="nav__badge" aria-label={`${item.badge} unread`}>{item.badge > 99 ? "99+" : item.badge}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
