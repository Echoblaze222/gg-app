import type { Metadata } from "next";
import { MemberHome } from "@/components/features/dashboard/member/MemberHome";
import { NotConnected } from "@/components/features/dashboard/NotConnected";
import { buildRequestContext } from "@/lib/dashboard/context";
import { loadMemberHome } from "@/lib/dashboard/home-loader";
import { getDashboardServices } from "@/lib/dashboard/services";
import { lagosToday } from "@/lib/member/dates";

export const metadata: Metadata = { title: "Home" };

export default async function MemberHomePage() {
  const ctx = await buildRequestContext();
  const services = getDashboardServices();
  if (!services) return <NotConnected reference={ctx.requestId} />;
  const data = await loadMemberHome(services, ctx, lagosToday(new Date()));
  return <MemberHome data={data} />;
}
