"use client";

import { usePathname } from "next/navigation";
import { LinkButton } from "@/components/ui";

const ITEMS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/members", label: "Members" },
] as const;

/**
 * Navigation between the admin screens that exist. Add an item here only when its screen is built, so there are
 * no dead buttons. The current screen is marked for screen readers and drawn as the black pill.
 */
export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin sections">
      <ul className="flex gap-2 overflow-x-auto py-1">
        {ITEMS.map((item) => {
          const current = item.href === "/admin" ? pathname === "/admin" : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <LinkButton href={item.href} variant={current ? "primary" : "secondary"} aria-current={current ? "page" : undefined}>
                {item.label}
              </LinkButton>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
