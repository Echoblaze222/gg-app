import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./cx";

export interface NavItem {
  href: string;
  label: string;
  /** Decorative icon. The label always shows, so the icon is never the only signal. */
  icon: ReactNode;
  /** Count shown in a small badge, for example unread notifications. Zero hides it. */
  badge?: number;
  /** What the badge counts, spoken after the number. Defaults to "new". */
  badgeLabel?: string;
  /** Match only this exact path, not child routes. Use for roots such as `/app`. */
  exact?: boolean;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

function clean(path: string): string {
  const withoutQuery = path.split(/[?#]/)[0] || "/";
  return withoutQuery.length > 1 ? withoutQuery.replace(/\/+$/, "") : withoutQuery;
}

/** True when `currentPath` is the item's page, or a page below it unless `exact`. Query strings and trailing slashes are ignored. */
export function isActivePath(currentPath: string, href: string, exact = false): boolean {
  const current = clean(currentPath);
  const target = clean(href);
  if (current === target) return true;
  return !exact && target !== "/" && current.startsWith(`${target}/`);
}

function Badge({ item }: { item: NavItem }) {
  if (!item.badge || item.badge < 1) return null;
  const shown = item.badge > 99 ? "99+" : String(item.badge);
  return (
    <span className="nav__badge">
      <span aria-hidden="true">{shown}</span>
      <span className="sr-only">{`${item.badge} ${item.badgeLabel ?? "new"}`}</span>
    </span>
  );
}

function NavLink({ item, currentPath, className }: { item: NavItem; currentPath: string; className: string }) {
  const active = isActivePath(currentPath, item.href, item.exact);
  return (
    <Link href={item.href} className={className} aria-current={active ? "page" : undefined}>
      <span className="nav__icon">{item.icon}</span>
      <span className="nav__label">{item.label}</span>
      <Badge item={item} />
    </Link>
  );
}

/** Phone navigation, fixed to the bottom. Two to five items. Pass `currentPath` from `usePathname()`. */
export function BottomTabBar({ items, currentPath, label = "Main", className }: { items: NavItem[]; currentPath: string; label?: string; className?: string }) {
  return (
    <nav aria-label={label} className={cx("tabbar", className)}>
      <ul className="tabbar__list" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => (
          <li key={item.href}>
            <NavLink item={item} currentPath={currentPath} className="tabbar__link" />
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Desktop and admin navigation. Sections get a heading. Pass `currentPath` from `usePathname()`. */
export function SideNav({
  sections,
  currentPath,
  label = "Main",
  header,
  footer,
  className,
}: {
  sections: NavSection[];
  currentPath: string;
  label?: string;
  header?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cx("sidenav", className)}>
      {header ? <div className="sidenav__header">{header}</div> : null}
      <div className="sidenav__sections">
        {sections.map((section, index) => (
          <div key={section.title ?? index} className="sidenav__section">
            {section.title ? <p className="sidenav__title">{section.title}</p> : null}
            <ul className="sidenav__list">
              {section.items.map((item) => (
                <li key={item.href}>
                  <NavLink item={item} currentPath={currentPath} className="sidenav__link" />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {footer ? <div className="sidenav__footer">{footer}</div> : null}
    </nav>
  );
}
