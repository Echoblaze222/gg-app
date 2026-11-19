import Link from "next/link";
import { Button, ProgressRing, TimelinePills } from "@/components/ui";
import type { TimelineStatus } from "@/components/ui";
import type { NoDueReason } from "@/lib/member/home";
import { describeDays, formatDay } from "@/lib/dashboard/display";
import type { MemberHomeData } from "@/lib/dashboard/home-loader";
import { paidShare } from "@/lib/dashboard/schedule";
import type { PillStatus } from "@/lib/dashboard/schedule";
import { EmptyState } from "../states";
import { Tile } from "../Tile";

const NO_DUE: Record<NoDueReason, { title: string; body: string }> = {
  no_plan: { title: "No plan yet", body: "You do not have a contribution plan yet." },
  plan_paused: { title: "Your plan is paused", body: "Nothing will fall due while your plan is paused." },
  nothing_due: { title: "Nothing due right now", body: "Your next contribution shows here before it is due." },
};

/** The schedule has five states, the timeline pills have four. A due entry is drawn as pending and worded "Due"; a missed entry is drawn as overdue. */
const TIMELINE_STATUS: Record<PillStatus, TimelineStatus> = {
  paid: "paid",
  due: "pending",
  overdue: "overdue",
  upcoming: "upcoming",
  missed: "overdue",
};
const TIMELINE_LABELS = { pending: "Due" } as const;

/**
 * Presentation only. Every number, status and rule comes from AI-5's lib/member (HomeView), so this file never decides what a value means.
 */
export function MemberHome({ data }: { data: MemberHomeData }) {
  const { view, schedule } = data;
  const unread = view.unreadBadge.status === "ready" ? view.unreadBadge.data : null;

  return (
    <>
      <div className="page-head">
        <h1 className="page-head__title">Home</h1>
        <p className="page-head__sub">
          Your contributions and payments.
          {unread ? ` You have ${unread} unread ${unread === "1" ? "notification" : "notifications"}.` : ""}
        </p>
      </div>

      <div className="bento">
        <Tile title="Next contribution" section={view.nextDue} tone="ink" className="bento__wide">
          {(nd) => {
            if (nd.kind === "none") {
              return (
                <EmptyState title={NO_DUE[nd.reason].title} compact>
                  {NO_DUE[nd.reason].body}
                </EmptyState>
              );
            }
            if (nd.kind === "unavailable") {
              return (
                <EmptyState title="Due date unavailable" compact>
                  We could not read the due date for your next contribution. Nothing was charged. Refresh, and contact support if this stays.
                </EmptyState>
              );
            }
            return (
              <>
                <p className="tile__value">{nd.amount}</p>
                <p className="tile__note">
                  {describeDays(nd.daysUntil)}, {formatDay(nd.dueOn)}.{nd.missed ? " Marked missed." : ""}
                </p>
                <div className="hero__actions">
                  {nd.canPay ? (
                    <Link href={`/app/pay?obligation=${encodeURIComponent(nd.obligationId)}`} className="btn btn--secondary btn--lg">
                      Pay {nd.amount}
                    </Link>
                  ) : (
                    <Button variant="secondary" size="lg" disabled>
                      {`Pay ${nd.amount}`}
                    </Button>
                  )}
                </div>
                {nd.payBlockedReason ? <p className="tile__note">{nd.payBlockedReason}</p> : null}
              </>
            );
          }}
        </Tile>

        <Tile title="Available balance" section={view.balance}>
          {(b) =>
            b.kind === "unverified" ? (
              <>
                <p className="tile__value tile__value--sm">Balance unavailable</p>
                <p className="tile__note">We could not confirm your balance, so we are not showing one. Your money has not changed. Try again shortly.</p>
              </>
            ) : (
              <>
                <p className="tile__value">{b.available}</p>
                <p className="tile__note">{b.hasHold ? `${b.held} is held for your withdrawal request. Total in your account: ${b.ledger}.` : "Everything in your account is available."}</p>
              </>
            )
          }
        </Tile>

        <Tile title="Contribution schedule" section={schedule} className="bento__wide">
          {(pills) => {
            if (pills.length === 0) {
              return (
                <EmptyState title="No schedule yet" compact>
                  Once you have an active plan, each due date shows here with its status.
                </EmptyState>
              );
            }
            const share = paidShare(pills);
            // Only one pill is the black "next up" pill: the first one that needs attention now.
            const currentId = pills.find((p) => p.status === "due" || p.status === "overdue")?.id;
            return (
              <>
                {share ? <ProgressRing value={share.paid} max={share.total} label="Share of the shown contributions that are paid" caption={`${share.paid} of ${share.total} shown are paid`} /> : null}
                <TimelinePills
                  label="Contribution schedule"
                  statusLabels={TIMELINE_LABELS}
                  items={pills.map((p) => ({ id: p.id, date: formatDay(p.dueOn), label: p.amount, status: TIMELINE_STATUS[p.status], current: p.id === currentId }))}
                />
              </>
            );
          }}
        </Tile>

        <Tile title="Payments in progress" section={view.pendingPayments}>
          {(items) =>
            items.length === 0 ? (
              <EmptyState title="No payments in progress" compact>
                When you pay, its status shows here until it is confirmed.
              </EmptyState>
            ) : (
              <ul className="rows">
                {items.map((p) => (
                  <li key={p.attemptId} className="rows__item">
                    <div className="rows__main">
                      <p className="rows__title">
                        {p.amount}, {p.statusLabel}
                      </p>
                      <p className="rows__meta">{p.explanation}</p>
                      <p className="rows__meta">Reference {p.reference}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )
          }
        </Tile>
      </div>
    </>
  );
}
