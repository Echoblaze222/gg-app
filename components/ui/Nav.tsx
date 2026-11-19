import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./cx";

export interface NavItem {
  href: string;
  /** Visible text. Icons are decorative, so the label always shows (bottom bar included). */
  label: string;
  icon: ReactNode;
  /** The parent decides which page is current, for example from usePathname. Sets aria-current="page". */
  current?: boolean;
  /** Shown but not usable, for example a screen that is not available for this account. */
  disabled?: boolean;
  /** Count of new things. Announced as text after the label. */
  badge?: number;
  /** Gallery only: draws a state without a pointer. */
  preview?: "hover" | "pressed" | "focus";
}

export const MAX_TAB_ITEMS = 5;

function ItemBody({ item }: { item: NavItem }) {
  return (
    <>
      <span className="navitem__icon">{item.icon}</span>
      <span className="navitem__label">{item.label}</span>
      {item.badge ? (
        <span className="navitem__badge">
          <span aria-hidden="true">{item.badge > 99 ? "99+" : item.badge}</span>
          <span className="sr-only">{`, ${item.badge} new`}</span>
        </span>
      ) : null}
    </>
  );
}

function Item({ item }: { item: NavItem }) {
  if (item.disabled) {
    return (
      <span className="navitem" aria-disabled="true">
        <ItemBody item={item} />
      </span>
    );
  }
  return (
    <Link href={item.href} className="navitem" aria-current={item.current ? "page" : undefined} data-preview={item.preview}>
      <ItemBody item={item} />
    </Link>
  );
}

export interface SidebarProps {
  /** Accessible name of the navigation, for example "Main". */
  label: string;
  items: NavItem[];
  /** Top slot, usually the Wordmark. */
  header?: ReactNode;
  /** Bottom slot, for example the account or a sign out button. */
  footer?: ReactNode;
  className?: string;
}

/** Left sidebar for wide screens. The current page is a black pill. Hide it below 768 px and show BottomTabBar instead. */
export function Sidebar({ label, items, header, footer, className }: SidebarProps) {
  return (
    <nav aria-label={label} className={cx("sidebar", className)}>
      {header ? <div className="sidebar__header">{header}</div> : null}
      <ul className="sidebar__list">
        {items.map((item) => (
          <li key={item.href}>
            <Item item={item} />
          </li>
        ))}
      </ul>
      {footer ? <div className="sidebar__footer">{footer}</div> : null}
    </nav>
  );
}

export interface BottomTabBarProps {
  label: string;
  /** Up to five items. More than that belongs in a drawer (Sheet). Extra items are not rendered. */
  items: NavItem[];
  /** `fixed` pins it to the bottom of the screen. `inline` keeps it in the flow (gallery, tests). */
  placement?: "fixed" | "inline";
  className?: string;
}

/** Bottom tab bar for phones, same black active pill as the sidebar. Height is `--tabbar-height` (64 px plus the safe area). */
export function BottomTabBar({ label, items, placement = "fixed", className }: BottomTabBarProps) {
  return (
    <nav aria-label={label} className={cx("tabbar", placement === "inline" && "tabbar--inline", className)}>
      <ul className="tabbar__list">
        {items.slice(0, MAX_TAB_ITEMS).map((item) => (
          <li key={item.href}>
            <Item item={item} />
          </li>
        ))}
      </ul>
    </nav>
  );
}
