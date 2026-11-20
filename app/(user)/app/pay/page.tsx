import Link from "next/link";
import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { EmptyState, ErrorState } from "@/components/features/dashboard/states";
import { NotConnected } from "@/components/features/dashboard/NotConnected";
import { PayController } from "@/components/features/dashboard/member/PayController";
import { RetryButton } from "@/components/features/dashboard/RetryButton";
import { buildRequestContext } from "@/lib/dashboard/context";
import { describeError } from "@/lib/dashboard/describe-error";
import { describeDays, formatDay } from "@/lib/dashboard/display";
import { safe } from "@/lib/dashboard/safe";
import { getDashboardServices } from "@/lib/dashboard/services";
import { daysBetween, isIsoDate, lagosToday } from "@/lib/member/dates";
import { formatNaira } from "@/lib/member/money";
import { isInFlight } from "@/lib/member/payment-status";
import { parsePaymentReturn } from "@/lib/payments/callback";

export const metadata: Metadata = { title: "Pay" };

type Search = Record<string, string | string[] | undefined>;

/**
 * Two entry points on one route, so no new route is needed:
 * 1. From the home card: /app/pay?obligation=<id>. Shows the real next due amount and starts a payment.
 * 2. Back from the provider: /app/pay?reference=...&trxref=... Verifies with the server. The redirect proves nothing.
 */
export default async function PayPage({ searchParams }: { searchParams: Promise<Search> }) {
  const ctx = await buildRequestContext();
  const services = getDashboardServices();
  if (!services) return <NotConnected reference={ctx.requestId} />;
  const sp = await searchParams;

  const hasReturn = sp.reference !== undefined || sp.trxref !== undefined;
  if (hasReturn) {
    const qs = new URLSearchParams();
    for (const key of ["reference", "trxref"]) {
      const v = sp[key];
      for (const item of Array.isArray(v) ? v : v === undefined ? [] : [v]) qs.append(key, item);
    }
    const parsed = parsePaymentReturn(qs.toString());
    if (!parsed.ok) {
      return (
        <Shell>
          <ErrorState
            title="This payment link is not valid"
            message="We could not read the payment reference, so nothing was checked."
            moneyLine="If you paid, your money is safe. Check your payment history before paying again."
            action="Go back to home and look at payments in progress."
            retry={<Link href="/app" className="btn btn--secondary">Back to home</Link>}
          />
        </Shell>
      );
    }
    return (
      <Shell>
        <PayController intent={null} amountLabel="" returnedReference={parsed.reference} />
      </Shell>
    );
  }

  const [due, attempts] = await Promise.all([
    safe(ctx.requestId, () => services.contributions.getNextDue(ctx)),
    safe(ctx.requestId, () => services.payments.listHistory(ctx, { limit: 10 })),
  ]);
  if (!due.ok) {
    return (
      <Shell>
        <ErrorState {...describeError(due.error, "Your contribution did not load")} retry={<RetryButton />} />
      </Shell>
    );
  }

  const obligation = due.value;
  const wanted = typeof sp.obligation === "string" ? sp.obligation : null;
  const payable = obligation !== null && (obligation.status === "scheduled" || obligation.status === "due" || obligation.status === "missed");

  if (!obligation || !payable || (wanted !== null && wanted !== obligation.id)) {
    return (
      <Shell>
        <Card>
          <EmptyState title={wanted !== null && obligation ? "This payment is out of date" : "Nothing to pay right now"} action={<Link href="/app" className="btn btn--secondary">Back to home</Link>}>
            {wanted !== null && obligation ? "Your next contribution changed since you opened this page. Go back to home to see the current one." : "You have no contribution due. Nothing was charged."}
          </EmptyState>
        </Card>
      </Shell>
    );
  }

  // Same rule as the home card: pay only when it is known that no payment for this obligation is already in progress.
  if (!attempts.ok || attempts.value.items.some((a) => a.obligationId === obligation.id && isInFlight(a.status))) {
    return (
      <Shell>
        <ErrorState
          title={attempts.ok ? "A payment is already in progress" : "We could not check for payments in progress"}
          message={attempts.ok ? "A payment for this contribution has not finished yet." : attempts.error.message}
          moneyLine="Do not pay again until it is confirmed."
          action={attempts.ok ? "Go back to home and wait for it to be confirmed." : "Refresh, then try again."}
          reference={attempts.ok ? undefined : attempts.error.reference}
          retry={attempts.ok ? <Link href="/app" className="btn btn--secondary">Back to home</Link> : <RetryButton />}
        />
      </Shell>
    );
  }

  const today = lagosToday(new Date());
  const amountLabel = formatNaira(obligation.amountKobo);
  const dueText = isIsoDate(obligation.dueOn) && isIsoDate(today) ? `${describeDays(daysBetween(today, obligation.dueOn))}, ${formatDay(obligation.dueOn)}` : "Due date unavailable";

  return (
    <Shell>
      <Card tone="ink" padding="lg">
        <div className="tile">
          <h2 className="tile__title">Contribution</h2>
          <p className="tile__value">{amountLabel}</p>
          <p className="tile__note">{dueText}. You will pay on the secure payment provider page.</p>
          <PayController intent={{ purpose: "scheduled_contribution", amountKobo: obligation.amountKobo, obligationId: obligation.id }} amountLabel={amountLabel} returnedReference={null} />
        </div>
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="page-head">
        <h1 className="page-head__title">Pay</h1>
      </div>
      <div className="pay-wrap">{children}</div>
    </>
  );
}
