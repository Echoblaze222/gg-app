import { AppError } from "@/contracts/errors";
import { ErrorState } from "@/components/ui";
import { describeError } from "@/lib/dashboard/describe-error";

/** Shown when the server has no registered services (see docs/handoffs/ai3-to-integrator-2-dashboard-wiring.md). Never shows fake data. */
export function NotConnected({ reference }: { reference: string }) {
  const error = new AppError("SYSTEM_UNAVAILABLE", { reference }).toShape();
  return (
    <div className="shell__content">
      <ErrorState {...describeError(error, "This area is not available yet")} />
    </div>
  );
}

export function AccessDenied({ error }: { error: ReturnType<AppError["toShape"]> }) {
  return (
    <div className="shell__content">
      <ErrorState {...describeError(error, "You do not have access to this area")} />
    </div>
  );
}
