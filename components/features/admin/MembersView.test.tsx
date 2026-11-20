import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/contracts/errors";
import type { MemberRow } from "@/lib/admin/members-page";
import { MembersScreen } from "./MembersScreen";
import { MembersView } from "./MembersView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(cleanup);

const ROWS: MemberRow[] = [
  { id: "1", name: "Ada Lovelace", email: "ada@example.ng", status: "active", joined: "1 Nov 2026" },
  { id: "2", name: "Tunde Bello", email: "tunde@example.ng", status: "suspended", joined: "2 Nov 2026" },
];

function table() {
  return screen.getByRole("table", { name: "Members" });
}

describe("MembersView ready", () => {
  it("shows each member with name, email, status as a word, and join date", () => {
    render(<MembersView state={{ kind: "ready", rows: ROWS, nextCursor: null }} query={{}} />);
    const t = within(table());
    expect(t.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(t.getByText("ada@example.ng")).toBeInTheDocument();
    expect(t.getByText("Active")).toBeInTheDocument();
    expect(t.getByText("Suspended")).toBeInTheDocument();
    expect(t.getByText("1 Nov 2026")).toBeInTheDocument();
    expect(screen.getByText(/Showing 2 members on this page/)).toBeInTheDocument();
  });

  it("says member in the singular for one row", () => {
    render(<MembersView state={{ kind: "ready", rows: [ROWS[0] as MemberRow], nextCursor: null }} query={{}} />);
    expect(screen.getByText(/Showing 1 member on this page/)).toBeInTheDocument();
  });

  it("has a labelled search field that submits to the list with a GET form", () => {
    const { container } = render(<MembersView state={{ kind: "ready", rows: ROWS, nextCursor: null }} query={{ search: "ada" }} />);
    const field = screen.getByLabelText("Search by name or email");
    expect(field).toHaveAttribute("name", "q");
    expect(field).toHaveValue("ada");
    expect(field).toHaveAttribute("maxlength", "100");
    const form = container.querySelector("form");
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/admin/members");
    expect(screen.getByRole("button", { name: "Search" })).toHaveAttribute("type", "submit");
  });

  it("keeps the chosen status in the search form", () => {
    const { container } = render(<MembersView state={{ kind: "ready", rows: ROWS, nextCursor: null }} query={{ status: "suspended" }} />);
    expect(container.querySelector('input[type="hidden"][name="status"]')).toHaveAttribute("value", "suspended");
  });

  it("draws one filter link per status that keeps the search and marks the current one", () => {
    render(<MembersView state={{ kind: "ready", rows: ROWS, nextCursor: null }} query={{ status: "active", search: "ada" }} />);
    const filters = within(screen.getByRole("navigation", { name: "Filter by status" }));
    expect(filters.getByRole("link", { name: "All" })).toHaveAttribute("href", "/admin/members?q=ada");
    expect(filters.getByRole("link", { name: "Active" })).toHaveAttribute("href", "/admin/members?status=active&q=ada");
    expect(filters.getByRole("link", { name: "Pending verification" })).toHaveAttribute("href", "/admin/members?status=pending_verification&q=ada");
    expect(filters.getByRole("link", { name: "Active" })).toHaveAttribute("aria-current", "page");
    expect(filters.getByRole("link", { name: "All" })).not.toHaveAttribute("aria-current");
  });

  it("offers the next page and keeps the filters, and a way back when on a later page", () => {
    render(<MembersView state={{ kind: "ready", rows: ROWS, nextCursor: "cur-2" }} query={{ status: "active", search: "ada", cursor: "cur-1" }} />);
    const pages = within(screen.getByRole("navigation", { name: "Pages" }));
    expect(pages.getByRole("link", { name: "Next page" })).toHaveAttribute("href", "/admin/members?status=active&q=ada&cursor=cur-2");
    expect(pages.getByRole("link", { name: "Back to the first page" })).toHaveAttribute("href", "/admin/members?status=active&q=ada");
    expect(screen.getByText(/More members are on the next page/)).toBeInTheDocument();
  });

  it("draws no page links when everything fits on one page", () => {
    render(<MembersView state={{ kind: "ready", rows: ROWS, nextCursor: null }} query={{}} />);
    expect(screen.queryByRole("navigation", { name: "Pages" })).not.toBeInTheDocument();
  });

  it("explains an empty result for a filter and offers to clear it", () => {
    render(<MembersView state={{ kind: "ready", rows: [], nextCursor: null }} query={{ search: "zzz" }} />);
    expect(screen.getByText("No members match")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute("href", "/admin/members");
    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument();
  });

  it("explains an empty list with no filter and offers nothing to clear", () => {
    render(<MembersView state={{ kind: "ready", rows: [], nextCursor: null }} query={{}} />);
    expect(screen.getByText("No members yet")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  it("never prints undefined, NaN or an em dash", () => {
    const { container } = render(<MembersView state={{ kind: "ready", rows: ROWS, nextCursor: "c" }} query={{ search: "a" }} />);
    const text = container.textContent ?? "";
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("NaN");
    expect(text).not.toContain("\u2014");
  });
});

describe("MembersView invalid", () => {
  it("shows the field message on the search box and an alert, and no table", () => {
    render(<MembersView state={{ kind: "invalid", fields: { search: "Use at most 100 characters." } }} query={{ search: "x" }} />);
    expect(screen.getByText("Check your filters")).toBeInTheDocument();
    expect(screen.getAllByText("Use at most 100 characters.").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Search by name or email")).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("gives a plain sentence when there is no field detail", () => {
    render(<MembersView state={{ kind: "invalid", fields: {} }} query={{ status: "banned" }} />);
    expect(screen.getByText(/One of the filters is not valid/)).toBeInTheDocument();
  });

  it("does not mark any status filter as current and does not carry the bad status into the form", () => {
    const { container } = render(<MembersView state={{ kind: "invalid", fields: {} }} query={{ status: "banned" }} />);
    expect(container.querySelector('input[type="hidden"][name="status"]')).toBeNull();
    expect(container.querySelector('[aria-current="page"]')).toBeNull();
  });
});

describe("MembersScreen", () => {
  it("shows the page title and the list when ready", () => {
    render(<MembersScreen state={{ kind: "ready", rows: ROWS, nextCursor: null }} query={{}} />);
    expect(screen.getByRole("heading", { level: 1, name: "Members" })).toBeInTheDocument();
    expect(table()).toBeInTheDocument();
  });

  it("explains a failure with the reference and offers a retry", () => {
    const error = new AppError("SYSTEM_UNAVAILABLE", { reference: "req-9" }).toShape();
    render(<MembersScreen state={{ kind: "failed", error }} query={{}} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("The member list could not load");
    expect(alert).toHaveTextContent(error.message);
    expect(alert).toHaveTextContent("No money moved");
    expect(alert).toHaveTextContent("Reference: req-9");
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("explains a blocked person without a retry, and links home", () => {
    const error = new AppError("PERMISSION_DENIED", { reference: "req-9" }).toShape();
    render(<MembersScreen state={{ kind: "blocked", error }} query={{}} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(error.message);
    expect(within(alert).queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(within(alert).getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/");
  });
});
