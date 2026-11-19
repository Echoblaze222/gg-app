import type { ReactNode } from "react";
import { Alert, Card } from "@/components/ui";
import type { AdminDashboard, DashboardSection } from "@/lib/admin/dashboard";
import { RefreshButton } from "./RefreshButton";

const numberFormat = new Intl.NumberFormat("en-NG");

function count(value: number): string {
  return numberFormat.format(value);
}

function minutesFor(seconds: number): number {
  return Math.max(1, Math.round(seconds / 60));
}

function Stat({ label, hint, value }: { label: string; hint?: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-ink/10 py-3 first:border-t-0 first:pt-0 last:pb-0">
      <dt className="text-ink">
        {label}
        {hint ? <span className="block text-sm text-ink-muted">{hint}</span> : null}
      </dt>
      <dd className="text-2xl font-semibold tabular-nums">{count(value)}</dd>
    </div>
  );
}

/** A section that could not load says so and offers a retry. It never shows a zero in its place. */
function Unavailable({ what }: { what: string }) {
  return (
    <Alert tone="warning" title={`${what} could not load`}>
      <p>This page only reads numbers, so no money moved. Try again in a moment.</p>
      <div className="mt-3">
        <RefreshButton />
      </div>
    </Alert>
  );
}

function SectionCard<T>({ id, title, section, children }: { id: string; title: string; section: DashboardSection<T>; children: (data: T) => ReactNode }) {
  return (
    <Card as="section" aria-labelledby={id}>
      <h2 id={id} className="mb-4 text-lg font-semibold">
        {title}
      </h2>
      {section.state === "ready" ? children(section.data) : <Unavailable what={title} />}
    </Card>
  );
}

function AttentionCard({ summary }: { summary: AdminDashboard }) {
  const lines: { label: string; value: number }[] = [];
  if (summary.payouts?.state === "ready") {
    lines.push({ label: "Payouts waiting for approval", value: summary.payouts.data.awaitingApproval });
  }
  if (summary.payments?.state === "ready") {
    lines.push({ label: `Payment attempts stuck for over ${minutesFor(summary.payments.data.stuckAfterSeconds)} minutes`, value: summary.payments.data.stuck });
  }
  if (summary.reconciliation?.state === "ready") {
    lines.push({ label: "Open reconciliation records", value: summary.reconciliation.data.open });
  }
  if (summary.support?.state === "ready") {
    lines.push({ label: "Support tickets that need staff", value: summary.support.data.needsStaff });
  }
  const total = summary.attentionTotal;
  return (
    <Card tone="ink" padding="lg" as="section" aria-labelledby="attention-title">
      <h2 id="attention-title" className="text-lg font-semibold">
        Needs attention
      </h2>
      {total === null ? (
        <p className="mt-3 text-ink-inverse/80">Some numbers could not load, so the total is hidden. The cards below show what did load.</p>
      ) : total === 0 ? (
        <p className="mt-3 text-xl">Nothing needs attention right now.</p>
      ) : (
        <p className="mt-2 font-display text-[length:var(--text-display)] leading-none tabular-nums">
          {count(total)}
          <span className="sr-only"> items need attention</span>
        </p>
      )}
      {total !== 0 && lines.length > 0 ? (
        <ul className="mt-6 grid gap-2">
          {lines.map((line) => (
            <li key={line.label} className="flex items-baseline justify-between gap-4">
              <span>{line.label}</span>
              <span className="font-semibold tabular-nums">{count(line.value)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

/**
 * The ready dashboard. Only sections the signed in staff member may see are present in the summary, so only those draw.
 * Every number says what it counts. Each card handles its own unavailable state.
 */
export function DashboardView({ summary }: { summary: AdminDashboard }) {
  return (
    <div className="grid gap-4">
      <AttentionCard summary={summary} />
      <div className="grid gap-4 md:grid-cols-2">
        {summary.payouts ? (
          <SectionCard id="payouts-title" title="Payouts" section={summary.payouts}>
            {(data) => (
              <dl>
                <Stat label="Waiting for approval" hint="The member confirmed with a one time code. An admin decides." value={data.awaitingApproval} />
                <Stat label="In progress" hint="Approved, or with the payment provider." value={data.inProgress} />
                <Stat label="Open in total" hint="Still holding the member's money." value={data.open} />
              </dl>
            )}
          </SectionCard>
        ) : null}
        {summary.payments ? (
          <SectionCard id="payments-title" title="Payments" section={summary.payments}>
            {(data) => (
              <dl>
                <Stat
                  label={`Stuck for over ${minutesFor(data.stuckAfterSeconds)} minutes`}
                  hint="Started but not finished on our side. Attempts waiting on the member's bank page are not counted."
                  value={data.stuck}
                />
              </dl>
            )}
          </SectionCard>
        ) : null}
        {summary.reconciliation ? (
          <SectionCard id="reconciliation-title" title="Reconciliation" section={summary.reconciliation}>
            {(data) => (
              <dl>
                <Stat label="Open records" hint="Differences between our records and the provider's, waiting for review." value={data.open} />
              </dl>
            )}
          </SectionCard>
        ) : null}
        {summary.support ? (
          <SectionCard id="support-title" title="Support" section={summary.support}>
            {(data) => (
              <dl>
                <Stat label="Need staff" hint="New, or waiting for our reply." value={data.needsStaff} />
                <Stat label="Waiting on the member" hint="We replied and are waiting for them." value={data.waitingOnMember} />
              </dl>
            )}
          </SectionCard>
        ) : null}
      </div>
      <p className="text-sm text-ink-muted">Numbers are counts of records, read when this page opened. They are not balances.</p>
    </div>
  );
}
