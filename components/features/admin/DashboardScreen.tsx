import type { DashboardPageState } from "@/lib/admin/dashboard-page";
import { AdminProblem } from "./AdminProblem";
import { DashboardView } from "./DashboardView";

export type DashboardScreenState = Exclude<DashboardPageState, { kind: "redirect" }>;

function UpdatedAt({ iso }: { iso: string }) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const text = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" }).format(date);
  return (
    <p className="text-ink-muted">
      Updated <time dateTime={date.toISOString()}>{text}</time>
    </p>
  );
}

/** Every state of the /admin page in one place: ready, blocked and failed. Loading and offline live in loading.tsx and the shell. */
export function DashboardScreen({ state }: { state: DashboardScreenState }) {
  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6">
      <header className="grid gap-1">
        <h1 className="font-display text-4xl leading-tight">Admin dashboard</h1>
        {state.kind === "ready" ? <UpdatedAt iso={state.summary.generatedAt} /> : null}
      </header>
      {state.kind === "ready" ? <DashboardView summary={state.summary} /> : <AdminProblem kind={state.kind} error={state.error} what="The dashboard" />}
    </div>
  );
}
