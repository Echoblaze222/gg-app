import type { ReactNode } from "react";
import { cx } from "./cx";

export interface Column<Row> {
  key: string;
  header: string;
  cell: (row: Row) => ReactNode;
  align?: "start" | "end";
  /** The one column used as the card title on phones (usually a name or a receipt number). */
  primary?: boolean;
}

export interface DataTableProps<Row> {
  /** Required. Names the table for screen readers. */
  caption: string;
  hideCaption?: boolean;
  columns: Column<Row>[];
  rows: Row[];
  getRowId: (row: Row) => string;
  className?: string;
}

/**
 * A table on wide screens, a stack of cards on phones (below 768 px).
 * Explicit ARIA roles keep the table semantics when CSS changes the display.
 * An empty list is the caller's job: show a StateMessage instead of an empty table.
 */
export function DataTable<Row>({ caption, hideCaption = false, columns, rows, getRowId, className }: DataTableProps<Row>) {
  return (
    <div className={cx("dtable", className)}>
      <table role="table" className="dtable__table">
        <caption className={hideCaption ? "sr-only" : "dtable__caption"}>{caption}</caption>
        <thead role="rowgroup" className="dtable__head">
          <tr role="row">
            {columns.map((column) => (
              <th key={column.key} role="columnheader" scope="col" data-align={column.align ?? "start"}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((row) => (
            <tr key={getRowId(row)} role="row" className="dtable__row">
              {columns.map((column) => (
                <td key={column.key} role="cell" data-label={column.header} data-align={column.align ?? "start"} data-primary={column.primary ? "true" : undefined}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
