import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MembersScreen } from "@/components/features/admin/MembersScreen";
import { loadAdminMembersPage } from "@/lib/admin/members-page";
import { buildRequestContext, getAdminMemberService, logAdmin } from "../../admin-gateway";

export const metadata: Metadata = {
  title: "Members | GG Contribution",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * /admin/members. The filters live in the address (`status`, `q`, `cursor`), so a view can be shared and the back
 * button works. Reads the session from cookies, so it renders per request.
 */
export default async function AdminMembersPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = { status: first(params.status), search: first(params.q), cursor: first(params.cursor) };
  const ctx = await buildRequestContext();
  const members = await getAdminMemberService();
  const state = await loadAdminMembersPage({ members, ctx, onUnexpectedError: (error, reference) => logAdmin("admin_members_page_unexpected", error, reference) }, query);
  if (state.kind === "redirect") {
    redirect(state.to);
  }
  return <MembersScreen state={state} query={query} />;
}
