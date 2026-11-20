import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { ErrorState } from "@/components/features/dashboard/states";
import { HistoryList } from "@/components/features/dashboard/member/HistoryList";
import { NotConnected } from "@/components/features/dashboard/NotConnected";
import { RetryButton } from "@/components/features/dashboard/RetryButton";
import { buildRequestContext } from "@/lib/dashboard/context";
import { describeError } from "@/lib/dashboard/describe-error";
import { loadHistoryPage } from "@/lib/dashboard/history-loader";
import { getDashboardServices } from "@/lib/dashboard/services";

export const metadata: Metadata = { title: "History" };

export default async function HistoryPage() {
  const ctx = await buildRequestContext();
  const services = getDashboardServices();
  if (!services) return <NotConnected reference={ctx.requestId} />;
  const result = await loadHistoryPage(services, ctx, null);
  return (
    <>
      <div className="page-head">
        <h1 className="page-head__title">History</h1>
        <p className="page-head__sub">Every payment you started, newest first.</p>
      </div>
      <Card>{result.ok ? <HistoryList initial={result.value} /> : <ErrorState {...describeError(result.error, "Your history did not load")} retry={<RetryButton />} />}</Card>
    </>
  );
}
