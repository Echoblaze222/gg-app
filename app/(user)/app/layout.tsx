import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AppShell } from "@/components/ui";
import type { NavItem } from "@/components/ui";
import { AccessDenied, NotConnected } from "@/components/features/dashboard/NotConnected";
import { SignOutButton } from "@/components/features/dashboard/SignOutButton";
import { buildRequestContext } from "@/lib/dashboard/context";
import { resolveAccess } from "@/lib/dashboard/access";
import { getDashboardServices } from "@/lib/dashboard/services";

export const metadata: Metadata = { title: { default: "GG Contribution", template: "%s | GG Contribution" }, robots: { index: false, follow: false } };

/** Add an entry here only when its route exists. No link in this app points at a missing screen. */
const NAV: NavItem[] = [
  { href: "/app", label: "Home", icon: "home", exact: true },
  { href: "/app/history", label: "History", icon: "receipt" },
  { href: "/app/notifications", label: "Alerts", icon: "bell" },
];

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const ctx = await buildRequestContext();
  const services = getDashboardServices();
  if (!services) return <NotConnected reference={ctx.requestId} />;

  // The server decides. A missing or expired session goes to sign in, never to a half rendered screen.
  const access = await resolveAccess(services.authorization, ctx, "member.history.read");
  if (access.kind === "sign_in") redirect(access.error.code === "AUTH_MFA_REQUIRED" ? "/mfa" : "/login");
  if (access.kind === "denied") return <AccessDenied error={access.error} />;

  return (
    <AppShell brand="GG Contribution" navLabel="Main" nav={NAV} actions={<SignOutButton />}>
      {children}
    </AppShell>
  );
}
