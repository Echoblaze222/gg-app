import type { MembersPageState, MembersQuery } from "@/lib/admin/members-page";
import { AdminProblem } from "./AdminProblem";
import { MembersView } from "./MembersView";

export type MembersScreenState = Exclude<MembersPageState, { kind: "redirect" }>;

/** Every state of the /admin/members page: ready, invalid filter, blocked and failed. Loading lives in loading.tsx. */
export function MembersScreen({ state, query }: { state: MembersScreenState; query: MembersQuery }) {
  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6">
      <header className="grid gap-1">
        <h1 className="font-display text-4xl leading-tight">Members</h1>
        <p className="text-ink-muted">Everyone who registered, newest first.</p>
      </header>
      {state.kind === "blocked" || state.kind === "failed" ? <AdminProblem kind={state.kind} error={state.error} what="The member list" /> : <MembersView state={state} query={query} />}
    </div>
  );
}
