import type { Page, PageRequest, SupportTicket } from "../../contracts/entities";
import type { SupportTicketStatus } from "../../contracts/enums";

/**
 * Staff list without a status filter. The repository can only list one status at a time, so the statuses are
 * walked in this order, those that need staff first. Within one status the repository order is kept.
 */
export const STAFF_STATUS_ORDER: readonly SupportTicketStatus[] = ["open", "pending_staff", "pending_member", "resolved", "closed"];

const CURSOR_PATTERN = /^([0-9])\|([\s\S]*)$/;
const MAX_ROUNDS = 50;

export function encodeStaffCursor(index: number, inner: string | null): string {
  return `${index}|${inner ?? ""}`;
}

/** Returns null for a cursor this module did not create, so a forged cursor is rejected instead of guessed. */
export function decodeStaffCursor(cursor: string | null | undefined): { index: number; inner: string | null } | null {
  if (cursor === null || cursor === undefined || cursor === "") {
    return { index: 0, inner: null };
  }
  const match = CURSOR_PATTERN.exec(cursor);
  if (!match) {
    return null;
  }
  const index = Number(match[1]);
  if (index >= STAFF_STATUS_ORDER.length) {
    return null;
  }
  const inner = match[2] ?? "";
  return { index, inner: inner === "" ? null : inner };
}

export type ListByStatus = (status: SupportTicketStatus, page: PageRequest) => Promise<Page<SupportTicket>>;

/** Lists tickets of every status as one cursor paginated list. Returns null when the cursor is not valid. */
export async function listAcrossStatuses(listByStatus: ListByStatus, page: PageRequest): Promise<Page<SupportTicket> | null> {
  const start = decodeStaffCursor(page.cursor);
  if (start === null) {
    return null;
  }
  let { index, inner } = start;
  const items: SupportTicket[] = [];
  for (let round = 0; round < MAX_ROUNDS && index < STAFF_STATUS_ORDER.length; round += 1) {
    const status = STAFF_STATUS_ORDER[index] as SupportTicketStatus;
    const result = await listByStatus(status, { limit: page.limit - items.length, cursor: inner });
    items.push(...result.items);
    if (result.nextCursor !== null) {
      inner = result.nextCursor;
    } else {
      index += 1;
      inner = null;
    }
    if (items.length >= page.limit) {
      break;
    }
  }
  return { items, nextCursor: index < STAFF_STATUS_ORDER.length ? encodeStaffCursor(index, inner) : null };
}
