import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

afterEach(cleanup);

describe("Button", () => {
  describe("idle", () => {
    it("renders a real button that defaults to type button", () => {
      render(<Button>Contribute</Button>);
      const button = screen.getByRole("button", { name: "Contribute" });
      expect(button).toHaveAttribute("type", "button");
      expect(button).not.toHaveAttribute("aria-busy");
      expect(button).not.toHaveAttribute("aria-disabled");
    });

    it("calls onClick", async () => {
      const onClick = vi.fn();
      render(<Button onClick={onClick}>Contribute</Button>);
      await userEvent.click(screen.getByRole("button"));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("announces nothing on first render", () => {
      render(<Button>Contribute</Button>);
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
    });

    it("applies variant and size classes", () => {
      render(
        <Button variant="accent" size="lg">
          Go
        </Button>,
      );
      expect(screen.getByRole("button")).toHaveClass("btn", "btn--accent", "btn--lg");
    });

    it("keeps focus on the keyboard", async () => {
      render(<Button>Go</Button>);
      await userEvent.tab();
      expect(screen.getByRole("button")).toHaveFocus();
    });
  });

  describe("disabled", () => {
    it("is not clickable", async () => {
      const onClick = vi.fn();
      render(
        <Button disabled onClick={onClick}>
          Go
        </Button>,
      );
      await userEvent.click(screen.getByRole("button"));
      expect(onClick).not.toHaveBeenCalled();
      expect(screen.getByRole("button")).toBeDisabled();
    });
  });

  describe("loading", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("locks the button, sets aria-busy, and keeps focus", () => {
      render(
        <Button status="loading" loadingLabel="Signing in">
          Sign in
        </Button>,
      );
      const button = screen.getByRole("button", { name: "Signing in" });
      expect(button).toHaveAttribute("aria-busy", "true");
      expect(button).toHaveAttribute("aria-disabled", "true");
      expect(button).not.toBeDisabled();
    });

    it("does not call onClick and blocks form submit while loading", () => {
      const onClick = vi.fn();
      const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
      render(
        <form onSubmit={onSubmit}>
          <Button type="submit" status="loading" onClick={onClick}>
            Sign in
          </Button>
        </form>,
      );
      screen.getByRole("button").click();
      expect(onClick).not.toHaveBeenCalled();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("shows the loader ring only after 300 ms", () => {
      const { container } = render(<Button status="loading">Sign in</Button>);
      expect(container.querySelector(".btn__spinner")).toBeNull();
      act(() => vi.advanceTimersByTime(299));
      expect(container.querySelector(".btn__spinner")).toBeNull();
      act(() => vi.advanceTimersByTime(1));
      expect(container.querySelector(".btn__spinner")).not.toBeNull();
    });

    it("never shows the loader for fast work", () => {
      const { container, rerender } = render(<Button status="loading">Sign in</Button>);
      act(() => vi.advanceTimersByTime(100));
      rerender(<Button status="idle">Sign in</Button>);
      act(() => vi.advanceTimersByTime(1000));
      expect(container.querySelector(".btn__spinner")).toBeNull();
    });

    it("announces the loading text", () => {
      render(
        <Button status="loading" loadingLabel="Signing in">
          Sign in
        </Button>,
      );
      expect(screen.getByRole("status")).toHaveTextContent("Signing in");
    });
  });

  describe("success", () => {
    it("locks, shows the success text and icon, and announces it", () => {
      const onClick = vi.fn();
      const { container } = render(
        <Button status="success" successLabel="Signed in" onClick={onClick}>
          Sign in
        </Button>,
      );
      const button = screen.getByRole("button", { name: "Signed in" });
      expect(button).toHaveAttribute("data-status", "success");
      expect(button).toHaveAttribute("aria-disabled", "true");
      expect(container.querySelector("svg")).not.toBeNull();
      expect(screen.getByRole("status")).toHaveTextContent("Signed in");
      button.click();
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe("failure", () => {
    it("states what happened, announces it, and allows a retry", async () => {
      const onClick = vi.fn();
      render(
        <Button status="failure" failureLabel="Wrong password. Try again." onClick={onClick}>
          Sign in
        </Button>,
      );
      const button = screen.getByRole("button", { name: "Wrong password. Try again." });
      expect(button).toHaveAttribute("data-status", "failure");
      expect(button).not.toHaveAttribute("aria-disabled");
      expect(screen.getByRole("status")).toHaveTextContent("Wrong password. Try again.");
      await userEvent.click(button);
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("reduced motion", () => {
    const original = window.matchMedia;
    afterEach(() => {
      window.matchMedia = original;
    });

    it("marks the button so the loader ring stops spinning", () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: true,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })) as unknown as typeof window.matchMedia;
      render(<Button>Go</Button>);
      expect(screen.getByRole("button")).toHaveAttribute("data-motion", "reduced");
    });
  });

  describe("gallery preview states", () => {
    it("passes the preview attribute through", () => {
      render(<Button preview="hover">Go</Button>);
      expect(screen.getByRole("button")).toHaveAttribute("data-preview", "hover");
    });
  });
});
