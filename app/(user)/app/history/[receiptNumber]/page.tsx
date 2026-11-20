import Link from "next/link";
import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { ErrorState } from "@/components/features/dashboard/states";
import { NotConnected } from "@/components/features/dashboard/NotConnected";
import { PrintButton } from "@/components/features/dashboard/member/PrintButton";
import { RetryButton } from "@/components/features/dashboard/RetryButton";
import { buildRequestContext } from "@/lib/dashboard/context";
import { describeError } from "@/lib/dashboard/describe-error";
import { formatDay } from "@/lib/dashboard/display";
import { safe } from "@/lib/dashboard/safe";
import { getDashboardServices } from "@/lib/dashboard/services";
import { receiptView } from "@/lib/member/receipt";

export const metadata: Metadata = { title: "Receipt" };

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function ReceiptPage({ params }: { params: Promise<{ receiptNumber: string }> }) {
  const ctx = await buildRequestContext();
  const services = getDashboardServices();
  if (!services) return <NotConnected reference={ctx.requestId} />;
  const receiptNumber = decode((await params).receiptNumber);

  // The service returns only the signed in member's own receipt. A number that is not theirs looks the same as one that does not exist.
  const result = await safe(ctx.requestId, () => services.receipts.getReceipt(ctx, { receiptNumber }));
  const back = (
    <Link href="/app/history" className="btn btn--secondary">
      Back to history
    </Link>
  );

  if (!result.ok) {
    return (
      <>
        <div className="page-head"><h1 className="page-head__title">Receipt</h1></div>
        <ErrorState {...describeError(result.error, "This receipt did not load")} retry={result.error.code === "NOT_FOUND" ? back : <RetryButton />} />
      </>
    );
  }

  const view = receiptView(result.value);
  if (!view) {
    return (
      <>
        <div className="page-head"><h1 className="page-head__title">Receipt</h1></div>
        <ErrorState
          title="This receipt cannot be shown"
          message="The receipt record looked wrong, so we are not showing it instead of showing a wrong amount."
          moneyLine="No money moved. Your payment record is unchanged."
          action="Contact support and quote the receipt number."
          reference={receiptNumber}
          retry={back}
        />
      </>
    );
  }

  const rows: Array<[string, string]> = [
    ["Receipt number", view.receiptNumber],
    ["Paid by", view.memberName],
    ["Date", `${formatDay(view.paidOn)}, ${view.paidAtTime}`],
    ...(view.channelLabel ? ([["Method", view.channelLabel]] as Array<[string, string]>) : []),
    ["Payment reference", view.providerReference],
    ["Balance after this payment", view.balanceAfter],
  ];

  return (
    <>
      <div className="page-head no-print">
        <h1 className="page-head__title">Receipt</h1>
      </div>
      <div className="pay-wrap">
        <Card padding="lg">
          <div className="tile">
            <h2 className="tile__title">Amount paid</h2>
            <p className="tile__value">{view.amount}</p>
            <dl className="receipt">
              {rows.map(([label, value]) => (
                <div key={label} className="receipt__row">
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <div className="hero__actions no-print">
              <PrintButton />
              {back}
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
