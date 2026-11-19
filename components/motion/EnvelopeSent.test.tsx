import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnvelopeSent } from "./EnvelopeSent";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const animationEnd = (el: Element, animationName: string) => {
  const ev = new Event("animationend", { bubbles: true });
  Object.defineProperty(ev, "animationName", { value: animationName });
  fireEvent(el, ev);
};

describe("EnvelopeSent", () => {
  it("says nothing until the request was sent", () => {
    const { container } = render(<EnvelopeSent state="idle" />);
    expect(container.querySelector(".env")).toHaveAttribute("data-state", "idle");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("announces that the email was sent, and hides the drawing from screen readers", () => {
    const { container } = render(<EnvelopeSent state="sent" message="Email sent. Check your inbox." />);
    expect(screen.getByRole("status")).toHaveTextContent("Email sent. Check your inbox.");
    expect(container.querySelector(".env__stage")).toHaveAttribute("aria-hidden", "true");
  });

  it("calls onSettled once, when the check has drawn", () => {
    const onSettled = vi.fn();
    const { container } = render(<EnvelopeSent state="sent" onSettled={onSettled} />);
    const check = container.querySelector(".env__check")!;
    animationEnd(check, "env-fold");
    expect(onSettled).not.toHaveBeenCalled();
    animationEnd(check, "env-check");
    animationEnd(check, "env-check");
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("with reduced motion, settles at once", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
    const onSettled = vi.fn();
    render(<EnvelopeSent state="sent" onSettled={onSettled} />);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });
});
