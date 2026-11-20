import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminNav } from "./AdminNav";

const route = vi.hoisted(() => ({ pathname: "/admin" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));

afterEach(cleanup);

describe("AdminNav", () => {
  it("links to each admin screen that exists", () => {
    render(<AdminNav />);
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/admin");
    expect(screen.getByRole("link", { name: "Members" })).toHaveAttribute("href", "/admin/members");
  });

  it("marks only the dashboard as current on /admin", () => {
    route.pathname = "/admin";
    render(<AdminNav />);
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Members" })).not.toHaveAttribute("aria-current");
  });

  it.each([["/admin/members"], ["/admin/members/123"]])("marks only members as current on %s", (pathname) => {
    route.pathname = pathname;
    render(<AdminNav />);
    expect(screen.getByRole("link", { name: "Members" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });

  it("does not treat a look alike path as members", () => {
    route.pathname = "/admin/members-archive";
    render(<AdminNav />);
    expect(screen.getByRole("link", { name: "Members" })).not.toHaveAttribute("aria-current");
  });

  it("names the navigation and never prints an em dash", () => {
    route.pathname = "/admin";
    const { container } = render(<AdminNav />);
    expect(screen.getByRole("navigation", { name: "Admin sections" })).toBeInTheDocument();
    expect(container.textContent ?? "").not.toContain("\u2014");
  });
});
