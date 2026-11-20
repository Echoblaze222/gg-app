import { AppError, type AppErrorShape } from "../../contracts/errors";
import type { Member } from "../../contracts/entities";
import type { MemberStatus } from "../../contracts/enums";
import type { RequestContext } from "../../contracts/services";
import type { AdminMemberService } from "../../contracts/v1_1";
import { classifyAdminError, type AdminProblem } from "./page-errors";

export const MEMBERS_PAGE_SIZE = 25;

/**
 * What the list shows about a member, and nothing more. Phone number and roles are left out on purpose:
 * the list is scrolled in public places, and those belong on the single member screen, which is audited.
 */
export interface MemberRow {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly status: MemberStatus;
  /** Already formatted on the server in Lagos time, so the browser cannot disagree with it. */
  readonly joined: string;
}

/** The raw values from the address bar. They are untrusted, the service validates them. */
export interface MembersQuery {
  readonly status?: string;
  readonly search?: string;
  readonly cursor?: string;
}

export type MembersPageState =
  | AdminProblem
  /** A filter value was not acceptable. The fields hold what to tell the person. */
  | { readonly kind: "invalid"; readonly fields: Record<string, string> }
  | { readonly kind: "ready"; readonly rows: MemberRow[]; readonly nextCursor: string | null };

function formatJoined(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeZone: "Africa/Lagos" }).format(date);
}

function toRow(member: Member): MemberRow {
  return { id: member.id, name: member.fullName, email: member.email, status: member.status, joined: formatJoined(member.createdAt) };
}

/** Builds a link to the list that keeps the filters. The search term travels as `q`. */
export function membersHref(query: MembersQuery): string {
  const params = new URLSearchParams();
  if (query.status) {
    params.set("status", query.status);
  }
  if (query.search) {
    params.set("q", query.search);
  }
  if (query.cursor) {
    params.set("cursor", query.cursor);
  }
  const text = params.toString();
  return text ? `/admin/members?${text}` : "/admin/members";
}

export interface MembersPageDeps {
  /** Null when the server side services could not be built. */
  readonly members: AdminMemberService | null;
  readonly ctx: RequestContext;
  readonly onUnexpectedError?: (error: unknown, reference: string) => void;
}

export async function loadAdminMembersPage(deps: MembersPageDeps, query: MembersQuery): Promise<MembersPageState> {
  const { ctx } = deps;
  if (!deps.members) {
    return { kind: "failed", error: new AppError("SYSTEM_UNAVAILABLE", { reference: ctx.requestId }).toShape() };
  }
  try {
    // The service checks admin.members.read first and validates both values. The cast only satisfies the compiler.
    const input: { status?: MemberStatus; search?: string } = {};
    if (query.status) {
      input.status = query.status as MemberStatus;
    }
    if (query.search) {
      input.search = query.search;
    }
    const result = await deps.members.list(ctx, input, { limit: MEMBERS_PAGE_SIZE, cursor: query.cursor ?? null });
    if (!result.ok) {
      if (result.error.code === "VALIDATION_FAILED") {
        return { kind: "invalid", fields: result.error.fields ?? {} };
      }
      return classifyAdminError(result.error);
    }
    return { kind: "ready", rows: result.value.items.map(toRow), nextCursor: result.value.nextCursor };
  } catch (error) {
    if (!(error instanceof AppError)) {
      deps.onUnexpectedError?.(error, ctx.requestId);
    }
    const shape: AppErrorShape = error instanceof AppError ? error.toShape() : new AppError("INTERNAL", { reference: ctx.requestId }).toShape();
    return classifyAdminError(shape);
  }
}
