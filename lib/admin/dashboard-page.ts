import { AppError, type AppErrorShape, type ErrorCode } from "../../contracts/errors";
import type { AuthorizationService, RequestContext } from "../../contracts/services";
import type { AdminDashboard, AdminDashboardService } from "./dashboard";

/**
 * Decides what the /admin page shows. Pure and free of Next.js, so every branch can be tested.
 * The page maps the result: redirect sends the browser away, the other kinds are drawn by DashboardScreen.
 */
export type DashboardPageState =
  | { readonly kind: "redirect"; readonly to: "/login" | "/mfa" }
  /** The person is signed in but may not use this page, or their account is not in good standing. No retry helps. */
  | { readonly kind: "blocked"; readonly error: AppErrorShape }
  /** Something failed. The page reads numbers only, so retrying is always safe. */
  | { readonly kind: "failed"; readonly error: AppErrorShape }
  | { readonly kind: "ready"; readonly summary: AdminDashboard };

const BLOCKED_CODES: readonly ErrorCode[] = ["PERMISSION_DENIED", "AUTH_ACCOUNT_SUSPENDED", "AUTH_EMAIL_NOT_VERIFIED"];

function classify(error: AppErrorShape): DashboardPageState {
  if (error.code === "AUTH_SESSION_EXPIRED") {
    return { kind: "redirect", to: "/login" };
  }
  if (error.code === "AUTH_MFA_REQUIRED") {
    return { kind: "redirect", to: "/mfa" };
  }
  if (BLOCKED_CODES.includes(error.code)) {
    return { kind: "blocked", error };
  }
  return { kind: "failed", error };
}

export interface DashboardPageDeps {
  /** Null when the server side services could not be built (missing setting, database unreachable). */
  readonly authorization: AuthorizationService | null;
  readonly dashboard: AdminDashboardService | null;
  readonly ctx: RequestContext;
  readonly onUnexpectedError?: (error: unknown, reference: string) => void;
}

export async function loadAdminDashboardPage(deps: DashboardPageDeps): Promise<DashboardPageState> {
  const { ctx } = deps;
  if (!deps.authorization || !deps.dashboard) {
    return { kind: "failed", error: new AppError("SYSTEM_UNAVAILABLE", { reference: ctx.requestId }).toShape() };
  }
  try {
    // The frozen route list gates /admin with admin.members.read. Each section then checks its own permission.
    const gate = await deps.authorization.requirePermission(ctx, "admin.members.read");
    if (!gate.ok) {
      return classify(gate.error);
    }
    const summary = await deps.dashboard.getSummary(ctx);
    if (!summary.ok) {
      return classify(summary.error);
    }
    return { kind: "ready", summary: summary.value };
  } catch (error) {
    if (!(error instanceof AppError)) {
      deps.onUnexpectedError?.(error, ctx.requestId);
    }
    const shape = error instanceof AppError ? error.toShape() : new AppError("INTERNAL", { reference: ctx.requestId }).toShape();
    return classify(shape);
  }
}
