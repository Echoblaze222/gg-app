import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand";
import { OfflineNotice } from "@/components/features/OfflineNotice";

/**
 * Shell for every admin screen: skip link, a slim header, the offline notice, and the main landmark.
 * It lists no navigation yet because the dashboard is the only admin screen that exists. Links to screens that
 * do not exist would be dead buttons.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-5 focus:py-3 focus:text-ink-inverse"
      >
        Skip to content
      </a>
      <header className="px-4 pt-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 rounded-full border border-ink/10 bg-surface px-4 py-2 md:px-6">
          <Link href="/admin" aria-label="Admin dashboard" className="rounded-full">
            <Wordmark />
          </Link>
          <span className="text-sm text-ink-muted">Admin</span>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 pt-4">
        <OfflineNotice />
      </div>
      <main id="main">{children}</main>
    </>
  );
}
