"use client";

import type { ReactNode } from "react";
import { Skeleton, SkeletonGroup } from "./Skeleton";
import { EmptyState, ErrorState } from "./StateView";
import { Button } from "./Button";
import { cx } from "./cx";

export interface DataColumn<Row> {
  key: string;
  /** Column heading. On phones it becomes the label inside each card. */
  header: string;
  cell: (row: Row) => ReactNode;
  align?: "start" | "end";
  /** The main cell of the row. On phones it is the card title and its label is hidden. One per table. */
  primary?: boolean;
}

export interface DataTableProps<Row> {
  /** Names the table for screen readers and is shown above it unless `hideCaption`. */
  caption: string;
  hideCaption?: boolean;
  columns: DataColumn<Row>[];
  rows: Row[];
  getRowId: (row: Row) => string;
  /** The parent says it is loading. Placeholders show only after 300 ms. */
  loading?: boolean;
  loadingLabel?: string;
  /** Set when the load failed. Say what happened and whether money moved where it applies. */
  error?: string;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyText?: ReactNode;
  emptyAction?: ReactNode;
  className?: string;
}

const SKELETON_ROWS = 4;

/**
 * Real table from 768 px. Below that, every row becomes a card and each cell shows its own heading.
 * States: data, loading (skeleton), error (with retry), empty.
 */
export function DataTable<Row>({
  caption,
  hideCaption,
  columns,
  rows,
  getRowId,
  loading,
  loadingLabel = "Loading table",
  error,
  onRetry,
  emptyTitle = "Nothing here yet",
  emptyText,
  emptyAction,
  className,
}: DataTableProps<Row>) {
  if (loading) {
    return (
      <SkeletonGroup label={loadingLabel} className={cx("dtable dtable--loading", className)}>
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <div key={index} className="dtable__skeleton-row">
            <Skeleton width="40%" />
            <Skeleton width="25%" />
          </div>
        ))}
      </SkeletonGroup>
    );
  }

  if (error) {
    return (
      <div className={cx("dtable dtable--state", className)}>
        <ErrorState
          compact
          headingLevel={3}
          title="Could not load this table"
          action={onRetry ? <Button variant="secondary" onClick={onRetry}>Try again</Button> : undefined}
        >
          {error}
        </ErrorState>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className={cx("dtable dtable--state", className)}>
        <EmptyState compact headingLevel={3} title={emptyTitle} action={emptyAction}>
          {emptyText}
        </EmptyState>
      </div>
    );
  }

  return (
    <div className={cx("dtable", className)}>
      <table className="dtable__table" role="table">
        <caption className={cx("dtable__caption", hideCaption && "sr-only")}>{caption}</caption>
        <thead role="rowgroup">
          <tr role="row">
            {columns.map((col) => (
              <th key={col.key} scope="col" role="columnheader" data-align={col.align}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((row) => (
            <tr key={getRowId(row)} role="row">
              {columns.map((col) => (
                <td key={col.key} role="cell" data-label={col.header} data-align={col.align} data-primary={col.primary ? "true" : undefined}>
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
