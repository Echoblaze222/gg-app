import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppErrorShape } from "@/contracts/errors";
import { AppError } from "@/contracts/errors";
import type { AdminDashboard } from "@/lib/admin/dashboard";
import { DashboardScreen } from "./DashboardScreen";
import { DashboardView } from "./DashboardView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(cleanup);

const PAYOUTS = { requested: 1, verified: 2, approved: 3, processing: 4, paid: 10, rejected: 0, failed: 0, cancelled: 0 };
const STUCK = { initiating: 1, awaiting_authentication: 20, processing: 2, verifying: 3, successful: 0, failed: 0, cancelled: 0, expired: 0, reversed: 0 };
const TICKETS = { open: 3, pending_member: 4, pending_staff: 2, resolved: 9, closed: 8 };

function fullSummary(): AdminDashboard {
  return {
    generatedAt: "2026-11-18T10:00:00.000Z",
    attentionTotal: 18,
    payouts: { state: "ready", data: { byStatus: PAYOUTS, awaitingApproval: 2, inProgress: 7, open: 10 } },
    payments: { state: "ready", data: { stuckAfterSeconds: 900, stuck: 6, stuckByStatus: STUCK } },
    reconciliation: { state: "ready", data: { open: 5 } },
    support: { state: "ready", data: { byStatus: TICKETS, needsStaff: 5, waitingOnMember: 4 } },
  };
}

/** The number printed next to a label inside a stat row. */
function statValue(label: string): string | null {
  return screen.getByText(label).parentElement?.querySelector("dd")?.textContent ?? null;
}

function shape(code: "PERMISSION_DENIED" | "SYSTEM_UNAVAILABLE" | "INTERNAL"): AppErrorShape {
  return new AppError(code, { reference: "req-9" }).toShape();
}

describe("DashboardView", () => {
  it("shows the total and every number with its label", () => {
    render(<DashboardView summary={fullSummary()} />);
    expect(screen.getByRole("heading", { name: "Needs attention" })).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
    expect(statValue("Waiting for approval")).toBe("2");
    expect(statValue("In progress")).toBe("7");
    expect(statValue("Open in total")).toBe("10");
    expect(statValue("Stuck for over 15 minutes")).toBe("6");
    expect(statValue("Open records")).toBe("5");
    expect(statValue("Need staff")).toBe("5");
    expect(statValue("Waiting on the member")).toBe("4");
  });

  it("lists what makes up the total inside the black card", () => {
    render(<DashboardView summary={fullSummary()} />);
    const attention = screen.getByRole("region", { name: "Needs attention" });
    expect(within(attention).getByText("Payouts waiting for approval")).toBeInTheDocument();
    expect(within(attention).getByText("Payment attempts stuck for over 15 minutes")).toBeInTheDocument();
    expect(within(attention).getByText("Open reconciliation records")).toBeInTheDocument();
    expect(within(attention).getByText("Support tickets that need staff")).toBeInTheDocument();
  });

  it("draws only the sections present in the summary", () => {
    const summary: AdminDashboard = { generatedAt: "2026-11-18T10:00:00.000Z", attentionTotal: 5, support: fullSummary().support };
    render(<DashboardView summary={summary} />);
    expect(screen.getByRole("region", { name: "Support" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Payouts" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Payments" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Reconciliation" })).not.toBeInTheDocument();
  });

  it("says nothing needs attention when the total is zero", () => {
    render(<DashboardView summary={{ ...fullSummary(), attentionTotal: 0 }} />);
    expect(screen.getByText("Nothing needs attention right now.")).toBeInTheDocument();
  });

  it("hides the total, keeps the numbers that loaded, and offers a retry inside the card that failed", () => {
    const summary: AdminDashboard = { ...fullSummary(), attentionTotal: null, payouts: { state: "unavailable" } };
    render(<DashboardView summary={summary} />);
    expect(screen.getByText(/the total is hidden/)).toBeInTheDocument();
    const payouts = screen.getByRole("region", { name: "Payouts" });
    expect(within(payouts).getByText("Payouts could not load")).toBeInTheDocument();
    expect(within(payouts).getByText(/no money moved/)).toBeInTheDocument();
    expect(within(payouts).getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(statValue("Need staff")).toBe("5");
    expect(screen.queryByText("Waiting for approval")).not.toBeInTheDocument();
  });

  it("never prints undefined, NaN or an em dash", () => {
    const { container } = render(<DashboardView summary={fullSummary()} />);
    const text = container.textContent ?? "";
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("NaN");
    expect(text).not.toContain("\u2014");
  });
});

describe("DashboardScreen", () => {
  it("shows the page title and the update time when ready", () => {
    const { container } = render(<DashboardScreen state={{ kind: "ready", summary: fullSummary() }} />);
    expect(screen.getByRole("heading", { level: 1, name: "Admin dashboard" })).toBeInTheDocument();
    expect(container.querySelector("time")?.getAttribute("datetime")).toBe("2026-11-18T10:00:00.000Z");
  });

  it("still renders when the update time is not a valid date", () => {
    const summary = { ...fullSummary(), generatedAt: "not a date" };
    const { container } = render(<DashboardScreen state={{ kind: "ready", summary }} />);
    expect(container.querySelector("time")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("explains a failure: what happened, what to do, that no money moved, the reference, and offers a retry", () => {
    const error = shape("SYSTEM_UNAVAILABLE");
    render(<DashboardScreen state={{ kind: "failed", error }} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("The dashboard could not load");
    expect(alert).toHaveTextContent(error.message);
    expect(alert).toHaveTextContent(error.action);
    expect(alert).toHaveTextContent("No money moved");
    expect(alert).toHaveTextContent("Reference: req-9");
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("explains a blocked person without offering a retry, and links home", () => {
    const error = shape("PERMISSION_DENIED");
    render(<DashboardScreen state={{ kind: "blocked", error }} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(error.message);
    expect(alert).toHaveTextContent(error.action);
    expect(alert).toHaveTextContent("Reference: req-9");
    expect(within(alert).queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(within(alert).getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/");
  });

  it("never prints an em dash in the problem states", () => {
    const { container } = render(<DashboardScreen state={{ kind: "failed", error: shape("INTERNAL") }} />);
    expect(container.textContent ?? "").not.toContain("\u2014");
  });
});
