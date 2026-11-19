import "server-only";
import type { AuthService, AuthorizationService, ContributionService, MemberService, NotificationService, PaymentService } from "@/contracts/services";
import type { RepositoryProvider } from "@/contracts/repositories";

/**
 * The service implementations the dashboards call. Screens depend on the interfaces in contracts/services.ts only.
 * The Integrator registers the real implementations once at server start (see docs/handoffs/ai3-to-integrator-2-dashboard-wiring.md).
 * Until then pages show an honest "not connected" state. There is no fallback data.
 */
export interface DashboardServices {
  authorization: AuthorizationService;
  auth: AuthService;
  members: MemberService;
  contributions: ContributionService;
  payments: PaymentService;
  notifications: NotificationService;
  repositories: RepositoryProvider;
}

const KEY = Symbol.for("gg.dashboard.services");
type Holder = { [KEY]?: DashboardServices };

export function registerDashboardServices(services: DashboardServices): void {
  (globalThis as Holder)[KEY] = services;
}

export function getDashboardServices(): DashboardServices | null {
  return (globalThis as Holder)[KEY] ?? null;
}
