import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardScreen } from "@/components/features/admin/DashboardScreen";
import { createAdminDashboardService } from "@/lib/admin/dashboard";
import { loadAdminDashboardPage } from "@/lib/admin/dashboard-page";
import { buildRequestContext, getAdminAuthorization, logAdmin } from "../admin-gateway";

export const metadata: Metadata = {
  title: "Admin dashboard | GG Contribution",
  robots: { index: false, follow: false },
};

/**
 * /admin. Reads the signed in staff member's session from cookies, so it renders per request.
 * The decisions live in lib/admin/dashboard-page.ts, the drawing in components/features/admin/DashboardScreen.tsx.
 */
export default async function AdminDashboardPage() {
  const ctx = await buildRequestContext();
  const authorization = await getAdminAuthorization();
  const dashboard = authorization
    ? createAdminDashboardService({
        authorization,
        // The counts repository is not reachable through the repository provider yet (request D-2).
        // Until then every section shows as unavailable, honestly, instead of showing a made up number.
        onSectionError: (section, error, reference) => logAdmin(`admin_dashboard_${section}_failed`, error, reference),
        onUnexpectedError: (error, reference) => logAdmin("admin_dashboard_unexpected", error, reference),
      })
    : null;

  const state = await loadAdminDashboardPage({
    authorization,
    dashboard,
    ctx,
    onUnexpectedError: (error, reference) => logAdmin("admin_dashboard_page_unexpected", error, reference),
  });
  if (state.kind === "redirect") {
    redirect(state.to);
  }
  return <DashboardScreen state={state} />;
}
