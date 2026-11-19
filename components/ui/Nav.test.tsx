import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BottomTabBar, MAX_TAB_ITEMS, Sidebar } from "./Nav";
import type { NavItem } from "./Nav";
import { HomeIcon, WalletIcon, ReceiptIcon, BellIcon, UserIcon, ShieldIcon } from "./icons";

afterEach(cleanup);

const items: NavItem[] = [
  { href: "/home", label: "Home", icon: <HomeIcon />, current: true },
  { href: "/pay", label: "Pay", icon: <WalletIcon /> },
  { href: "/history", label: "History", icon: <ReceiptIcon />, disabled: true },
  { href: "/alerts", label: "Alerts", icon: <BellIcon />, badge: 3 },
  { href: "/me", label: "Profile", icon: <UserIcon /> },
  { href: "/security", label: "Security", icon: <ShieldIcon /> },
];

describe("Sidebar", () => {
  it("is a named navigation landmark with a link per item", () => {
    render(<Sidebar label="Main" items={items} header={<span>GG</span>} footer={<button type="button">Sign out</button>} />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getAllByRole("link")).toHaveLength(5);
    expect(within(nav).getByText("GG")).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("marks only the current page and disables unavailable items", () => {
    render(<Sidebar label="Main" items={items} />);
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Pay" })).not.toHaveAttribute("aria-current");
    expect(screen.queryByRole("link", { name: "History" })).toBeNull();
    expect(screen.getByText("History").closest("[aria-disabled='true']")).not.toBeNull();
  });

  it("announces the badge count as text", () => {
    render(<Sidebar label="Main" items={items} />);
    expect(screen.getByRole("link", { name: /Alerts.*3 new/ })).toBeInTheDocument();
  });

  it("keeps icons decorative so the label is the name", () => {
    const { container } = render(<Sidebar label="Main" items={items} />);
    for (const svg of container.querySelectorAll("svg")) expect(svg).toHaveAttribute("aria-hidden", "true");
  });
});

describe("BottomTabBar", () => {
  it("shows at most five items, each with a visible label", () => {
    render(<BottomTabBar label="Main" items={items} placement="inline" />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav.querySelectorAll("li")).toHaveLength(MAX_TAB_ITEMS);
    expect(within(nav).getByText("Home")).toBeVisible();
    expect(within(nav).queryByText("Security")).toBeNull();
  });

  it("uses the same current page marker as the sidebar", () => {
    render(<BottomTabBar label="Main" items={items} />);
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
  });
});
