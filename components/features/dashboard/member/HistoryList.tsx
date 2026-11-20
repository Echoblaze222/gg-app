"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert, Button, DataTable } from "@/components/ui";
import type { DataColumn, Tone } from "@/components/ui";
import { StatusIcon } from "@/components/ui/StatusIcon";
import type { AppErrorShape } from "@/contracts/errors";
import { loadHistoryPageAction } from "@/lib/dashboard/actions";
import { describeError } from "@/lib/dashboard/describe-error";
import { formatDay } from "@/lib/dashboard/display";
import type { HistoryPageData } from "@/lib/dashboard/history-loader";
import type { HistoryRow } from "@/lib/member/history";
import { appendPage } from "@/lib/member/pages";
import type { StatusTone } from "@/lib/member/payment-status";

const TONE: Record<StatusTone, Tone> = { success: "success", pending: "pending", failure: "error", neutral: "info", warning: "warning" };

const columns: DataColumn<HistoryRow>[] = [
  { key: "date", header: "Date", cell: (r) => formatDay(r.dateLagos) },
  {
    key: "payment",
    header: "Payment",
    cell: (r) => (
      <span>
        {r.purposeLabel}
        {r.channelLabel ? `, ${r.channelLabel}` : ""}
        <span className="rows__meta" style={{ display: "block", overflowWrap: "anywhere" }}>
          Reference {r.reference}
        </span>
      </span>
    ),
  },
  { key: "amount", header: "Amount", align: "end", cell: (r) => r.amount },
  {
    key: "status",
    header: "Status",
    cell: (r) => (
      <span>
        <span className="chip" style={{ border: 0, padding: 0 }}>
          <StatusIcon tone={TONE[r.tone]} className="size-4" />
          {r.statusLabel}
        </span>
        <span className="rows__meta" style={{ display: "block" }}>
          {r.failure ? `${r.failure.message} ${r.failure.action}` : r.explanation}
        </span>
      </span>
    ),
  },
  {
    key: "receipt",
    header: "Receipt",
    cell: (r) => (r.href ? <Link href={r.href}>{r.receiptNumber}</Link> : <span className="rows__meta">{r.statusLabel === "Successful" ? "Not linked yet" : "None"}</span>),
  },
];

/** Payment history. The first page comes from the server, "Load more" fetches the next with the opaque cursor and never reorders what is shown. */
export function HistoryList({ initial }: { initial: HistoryPageData }) {
  const [rows, setRows] = useState<readonly HistoryRow[]>(initial.rows);
  const [skipped, setSkipped] = useState(initial.skipped);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppErrorShape | null>(null);

  async function loadMore() {
    if (busy || cursor === null) return;
    setBusy(true);
    setError(null);
    try {
      const result = await loadHistoryPageAction({ cursor });
      if (result.ok) {
        setRows((existing) => appendPage(existing, result.value.rows));
        setSkipped((n) => n + result.value.skipped);
        setCursor(result.value.nextCursor);
      } else {
        setError(result.error); // the list stays visible
      }
    } catch {
      setError({ code: "SYSTEM_UNAVAILABLE", message: "We did not get a reply.", messageKey: "error.system_unavailable", moneyMoved: "no", retrySafe: true, action: "Check your connection and try again.", reference: "no-reply" });
    } finally {
      setBusy(false);
    }
  }

  const copy = error ? describeError(error, "More payments did not load") : null;

  return (
    <div className="tile">
      <DataTable
        caption="Payment history, newest first"
        columns={columns}
        rows={[...rows]}
        getRowId={(r) => r.id}
        emptyTitle="No payments yet"
        emptyText="Payments you make show here with their status. A receipt appears once a payment is confirmed."
      />
      {skipped > 0 ? (
        <Alert tone="warning" title="Some payments are not shown">
          {skipped} {skipped === 1 ? "payment" : "payments"} could not be displayed because its record looked wrong. Nothing was changed. Contact support if you expected to see {skipped === 1 ? "it" : "them"}.
        </Alert>
      ) : null}
      {copy ? (
        <Alert tone="error" title={copy.title}>
          {copy.message} {copy.moneyLine} {copy.action} Reference {copy.reference}.
        </Alert>
      ) : null}
      {cursor !== null ? (
        <div>
          <Button variant="secondary" status={busy ? "loading" : error ? "failure" : "idle"} loadingLabel="Loading" failureLabel="Could not load. Try again." onClick={loadMore}>
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
}
