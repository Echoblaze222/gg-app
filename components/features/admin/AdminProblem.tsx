import { ErrorState, LinkButton } from "@/components/ui";
import type { AppErrorShape } from "@/contracts/errors";
import { RefreshButton } from "./RefreshButton";

/**
 * The blocked and failed states of every admin screen, worded the same everywhere.
 * Admin screens only read data, so a failure can truthfully say no money moved and a retry is always safe.
 */
export function AdminProblem({ kind, error, what }: { kind: "blocked" | "failed"; error: AppErrorShape; what: string }) {
  if (kind === "blocked") {
    return (
      <ErrorState title={error.message} action={<LinkButton href="/" variant="secondary">Back to home</LinkButton>}>
        {error.action} Reference: {error.reference}.
      </ErrorState>
    );
  }
  return (
    <ErrorState title={`${what} could not load`} action={<RefreshButton />}>
      {error.message} {error.action} No money moved: this page only reads numbers. Reference: {error.reference}.
    </ErrorState>
  );
}
