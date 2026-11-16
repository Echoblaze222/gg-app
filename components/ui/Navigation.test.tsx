import { cleanup, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BottomTabBar, SideNav, isActivePath } from "./Navigation";
import type { NavItem } from "./Navigation";
import { BellIcon, HomeIcon, ReceiptIcon } from "./icons";

afterEach(cleanup);

const items: NavItem[] = [
  { href: "/app", label: "Home", icon: <HomeIcon />, exact: true },
  { href: "/app/history", label: "History", icon: <ReceiptIcon /> },
  { href: "/app/notifications", label: "Alerts", icon: <BellIcon />, badge: 3, badgeLabel: "unread" },
];

describe("isActivePath", () => {
  it.each([
    ["/app", "/app", false, true],
    ["/app/", "/app", false, true],
    ["/app?tab=1", "/app", false, true],
    ["/app#top", "/app", false, true],
    ["/app/history", "/app/history", false, true],
    ["/app/history/GG-1", "/app/history", false, true],
    ["/app/history/GG-1", "/app", true, false],
    ["/app/history/GG-1", "/app", false, true],
    ["/app/historyx", "/app/history", false, false],
    ["/application", "/app", false, false],
    ["/", "/", false, true],
    ["/app", "/", false, false],
    ["/admin", "/app", false, false],
  ])("current %s, item %s, exact %s gives %s", (current, href, exact, expected) => {
    expect(isActivePath(current, href, exact)).toBe(expected);
  });
});

describe("BottomTabBar", () => {
  it("is a labelled navigation with a link per item", () => {
    render(<BottomTabBar items={items} currentPath="/app" />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getAllByRole("link")).toHaveLength(3);
    expect(screen.getByRole("link", { name: /Home/ })).toHaveAttribute("href", "/app");
  });

  it("marks only the current page and never both Home and a child page", () => {
    render(<BottomTabBar items={items} currentPath="/app/history/GG-1" />);
    expect(screen.getByRole("link", { name: /History/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Home/ })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: /Alerts/ })).not.toHaveAttribute("aria-current");
  });

  it("always shows the text label, not only an icon", () => {
    render(<BottomTabBar items={items} currentPath="/app" />);
    expect(screen.getByText("History")).toBeVisible();
  });

  it("speaks the badge and shows a short count", () => {
    render(<BottomTabBar items={items} currentPath="/app" />);
    expect(screen.getByRole("link", { name: /Alerts/ })).toHaveTextContent("3 unread");
  });

  it("caps a large badge and hides zero", () => {
    const many: NavItem[] = [
      { href: "/a", label: "A", icon: <HomeIcon />, badge: 250 },
      { href: "/b", label: "B", icon: <HomeIcon />, badge: 0 },
    ];
    const { container } = render(<BottomTabBar items={many} currentPath="/" />);
    expect(container.querySelectorAll(".nav__badge")).toHaveLength(1);
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("uses a custom label", () => {
    render(<BottomTabBar items={items} currentPath="/app" label="Member" />);
    expect(screen.getByRole("navigation", { name: "Member" })).toBeInTheDocument();
  });

  it("keeps the toast offset equal to the tab bar height", () => {
    const css = readFileSync(join(process.cwd(), "styles/components/nav.css"), "utf8");
    const height = css.match(/--tabbar-height:\s*(\d+px)/)?.[1];
    const offset = css.match(/--toast-offset-bottom:\s*(\d+px)/)?.[1];
    expect(height).toBeDefined();
    expect(offset).toBe(height);
  });
});

describe("SideNav", () => {
  const sections = [
    { title: "Members", items: [items[0], items[1]] },
    { title: "Money", items: [items[2]] },
  ];

  it("renders sections with headings and links", () => {
    render(<SideNav sections={sections} currentPath="/app" label="Admin" />);
    expect(screen.getByRole("navigation", { name: "Admin" })).toBeInTheDocument();
    expect(screen.getByText("Members")).toBeInTheDocument();
    expect(screen.getByText("Money")).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("marks the current page", () => {
    render(<SideNav sections={sections} currentPath="/app/notifications" />);
    expect(screen.getByRole("link", { name: /Alerts/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByRole("link").filter((a) => a.hasAttribute("aria-current"))).toHaveLength(1);
  });

  it("renders header and footer slots", () => {
    render(<SideNav sections={sections} currentPath="/app" header={<span>Logo</span>} footer={<button type="button">Sign out</button>} />);
    expect(screen.getByText("Logo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("works without section titles", () => {
    render(<SideNav sections={[{ items }]} currentPath="/app" />);
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });
});
