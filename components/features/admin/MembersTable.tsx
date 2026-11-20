"use client";

import type { ReactNode } from "react";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import type { MemberStatus } from "@/contracts/enums";
import type { MemberRow } from "@/lib/admin/members-page";

const STATUS_LABEL: Record<MemberStatus, string> = {
  active: "Active",
  suspended: "Suspended",
  pending_verification: "Pending verification",
  closed: "Closed",
};

/** Status is always a word, never only a colour. */
function StatusBadge({ status }: { status: MemberStatus }) {
  return (
    <span data-status={status} className="inline-flex items-center rounded-full border border-ink/20 px-3 py-1 text-sm font-medium">
      {STATUS_LABEL[status]}
    </span>
  );
}

const columns: DataColumn<MemberRow>[] = [
  { key: "name", header: "Name", primary: true, cell: (row) => <span className="font-medium">{row.name}</span> },
  { key: "email", header: "Email", cell: (row) => <span className="break-all">{row.email}</span> },
  { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
  { key: "joined", header: "Joined", cell: (row) => row.joined },
];

/**
 * The member list as a table from 768 px and as cards below it. It is a client component only because the shared
 * table takes functions, which a server page cannot pass. It receives plain rows and never fetches anything.
 */
export function MembersTable({ rows, emptyTitle, emptyText, emptyAction }: { rows: MemberRow[]; emptyTitle: string; emptyText: string; emptyAction?: ReactNode }) {
  return <DataTable caption="Members" hideCaption columns={columns} rows={rows} getRowId={(row) => row.id} emptyTitle={emptyTitle} emptyText={emptyText} emptyAction={emptyAction} />;
}
