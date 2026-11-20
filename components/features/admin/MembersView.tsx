import { Alert, Button, Card, Input, LinkButton } from "@/components/ui";
import type { MemberStatus } from "@/contracts/enums";
import { membersHref, type MembersPageState, type MembersQuery } from "@/lib/admin/members-page";
import { MembersTable } from "./MembersTable";

const STATUS_FILTERS: readonly { value: MemberStatus | null; label: string }[] = [
  { value: null, label: "All" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "pending_verification", label: "Pending verification" },
  { value: "closed", label: "Closed" },
];

export type MembersViewState = Extract<MembersPageState, { kind: "ready" | "invalid" }>;

/**
 * Search, status filter and the results. Search is a plain GET form, so it works without script and the address
 * can be shared. Filters and the search term travel in the address, the cursor only moves forward.
 */
export function MembersView({ state, query }: { state: MembersViewState; query: MembersQuery }) {
  const fields = state.kind === "invalid" ? state.fields : {};
  const hasFilter = Boolean(query.status || query.search);
  const currentStatus = query.status ?? null;

  return (
    <div className="grid gap-4">
      <Card as="section" aria-labelledby="find-title">
        <h2 id="find-title" className="sr-only">
          Find members
        </h2>
        <form method="get" action="/admin/members" role="search" className="grid gap-4">
          <Input label="Search by name or email" name="q" type="search" defaultValue={query.search ?? ""} maxLength={100} autoComplete="off" error={fields.search} />
          {state.kind === "ready" && query.status ? <input type="hidden" name="status" value={query.status} /> : null}
          <div>
            <Button type="submit">Search</Button>
          </div>
        </form>
        <nav aria-label="Filter by status" className="mt-4">
          <ul className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((filter) => {
              const current = state.kind === "ready" && filter.value === currentStatus;
              return (
                <li key={filter.label}>
                  <LinkButton
                    href={membersHref({ status: filter.value ?? undefined, search: query.search })}
                    variant={current ? "primary" : "secondary"}
                    aria-current={current ? "page" : undefined}
                  >
                    {filter.label}
                  </LinkButton>
                </li>
              );
            })}
          </ul>
        </nav>
      </Card>

      {state.kind === "invalid" ? (
        <Alert tone="error" title="Check your filters">
          {Object.values(fields).length > 0 ? Object.values(fields).join(" ") : "One of the filters is not valid. Pick a status from the list and try again."}
        </Alert>
      ) : (
        <Card as="section" aria-labelledby="results-title">
          <h2 id="results-title" className="mb-3 text-lg font-semibold">
            Members
          </h2>
          <MembersTable
            rows={state.rows}
            emptyTitle={hasFilter ? "No members match" : "No members yet"}
            emptyText={hasFilter ? "Try a different name or email, or clear the filters." : "Members appear here after they register."}
            emptyAction={hasFilter ? <LinkButton href="/admin/members" variant="secondary">Clear filters</LinkButton> : undefined}
          />
          {state.rows.length > 0 ? (
            <p className="mt-3 text-sm text-ink-muted">
              Showing {state.rows.length} {state.rows.length === 1 ? "member" : "members"} on this page, newest first.
              {state.nextCursor ? " More members are on the next page." : ""}
            </p>
          ) : null}
          {state.nextCursor || query.cursor ? (
            <nav aria-label="Pages" className="mt-4 flex flex-wrap gap-2">
              {query.cursor ? (
                <LinkButton href={membersHref({ status: query.status, search: query.search })} variant="secondary">
                  Back to the first page
                </LinkButton>
              ) : null}
              {state.nextCursor ? (
                <LinkButton href={membersHref({ status: query.status, search: query.search, cursor: state.nextCursor })} variant="secondary">
                  Next page
                </LinkButton>
              ) : null}
            </nav>
          ) : null}
        </Card>
      )}
    </div>
  );
}
