import { AppError } from "../../contracts/errors";
import type { AuthorizationService, RequestContext } from "../../contracts/services";
import type { AdminDashboard, AdminDashboardService } from "./dashboard";
import { classifyAdminError, type AdminProblem } from "./page-errors";

/**
 * Decides what the /admin page shows. Pure and free of Next.js, so every branch can be tested.
 * The page maps the result: redirect sends the browser away, the other kinds are drawn by DashboardScreen.
 */
export type DashboardPageState = AdminProblem | { readonly kind: "ready"; readonly summary: AdminDashboard };

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
      return classifyAdminError(gate.error);
    }
    const summary = await deps.dashboard.getSummary(ctx);
    if (!summary.ok) {
      return classifyAdminError(summary.error);
    }
    return { kind: "ready", summary: summary.value };
  } catch (error) {
    if (!(error instanceof AppError)) {
      deps.onUnexpectedError?.(error, ctx.requestId);
    }
    const shape = error instanceof AppError ? error.toShape() : new AppError("INTERNAL", { reference: ctx.requestId }).toShape();
    return classifyAdminError(shape);
  }
}
