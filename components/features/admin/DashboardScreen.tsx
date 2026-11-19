import { ErrorState, LinkButton } from "@/components/ui";
import type { DashboardPageState } from "@/lib/admin/dashboard-page";
import { DashboardView } from "./DashboardView";
import { RefreshButton } from "./RefreshButton";

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

function Problem({ state }: { state: Exclude<DashboardScreenState, { kind: "ready" }> }) {
  const { error } = state;
  if (state.kind === "blocked") {
    return (
      <ErrorState title={error.message} action={<LinkButton href="/" variant="secondary">Back to home</LinkButton>}>
        {error.action} Reference: {error.reference}.
      </ErrorState>
    );
  }
  // The page only reads numbers, so it can truthfully say no money moved and a retry is always safe.
  return (
    <ErrorState title="The dashboard could not load" action={<RefreshButton />}>
      {error.message} {error.action} No money moved: this page only reads numbers. Reference: {error.reference}.
    </ErrorState>
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
      {state.kind === "ready" ? <DashboardView summary={state.summary} /> : <Problem state={state} />}
    </div>
  );
}
