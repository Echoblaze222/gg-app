import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_VISIBLE_TOASTS, ToastProvider, useToast } from "./Toast";
import type { ToastOptions } from "./Toast";

afterEach(cleanup);

type Api = ReturnType<typeof useToast>;
const holder: { api?: Api } = {};
const api = {
  show: (o: ToastOptions) => holder.api!.show(o),
  dismiss: (id: string) => holder.api!.dismiss(id),
};

function Capture() {
  const value = useToast();
  useEffect(() => {
    holder.api = value;
  }, [value]);
  return null;
}
function setup() {
  render(
    <ToastProvider>
      <Capture />
    </ToastProvider>,
  );
}
const show = (o: ToastOptions) => {
  let id = "";
  act(() => {
    id = api.show(o);
  });
  return id;
};

describe("Toast", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("throws a helpful error outside the provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Capture />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });

  it("renders a polite notifications region", () => {
    setup();
    const region = screen.getByRole("region", { name: "Notifications" });
    expect(region.querySelector("[aria-live='polite']")).not.toBeNull();
  });

  it("shows title and message", () => {
    setup();
    show({ tone: "success", title: "Contribution received", message: "Thank you" });
    expect(screen.getByText("Contribution received")).toBeInTheDocument();
    expect(screen.getByText("Thank you")).toBeInTheDocument();
  });

  it("closes by itself after 5 seconds", () => {
    setup();
    show({ tone: "success", title: "Saved" });
    act(() => vi.advanceTimersByTime(4999));
    expect(screen.getByText("Saved")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1 + 200));
    expect(screen.queryByText("Saved")).toBeNull();
  });

  it("keeps errors until dismissed", () => {
    setup();
    show({ tone: "error", title: "Payment failed" });
    act(() => vi.advanceTimersByTime(120_000));
    expect(screen.getByRole("alert")).toHaveTextContent("Payment failed");
  });

  it("honors a custom duration, including null", () => {
    setup();
    show({ title: "Quick", durationMs: 1000 });
    show({ title: "Sticky", durationMs: null });
    act(() => vi.advanceTimersByTime(1200));
    expect(screen.queryByText("Quick")).toBeNull();
    expect(screen.getByText("Sticky")).toBeInTheDocument();
  });

  it("pauses while hovered and resumes with the time that was left", () => {
    setup();
    show({ title: "Saved" });
    const toast = screen.getByText("Saved").closest("li")!;
    act(() => vi.advanceTimersByTime(3000));
    fireEvent.mouseEnter(toast);
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByText("Saved")).toBeInTheDocument();
    fireEvent.mouseLeave(toast);
    act(() => vi.advanceTimersByTime(1900));
    expect(screen.getByText("Saved")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(100 + 200));
    expect(screen.queryByText("Saved")).toBeNull();
  });

  it("pauses while a control inside has keyboard focus", () => {
    setup();
    show({ title: "Saved" });
    const close = screen.getByRole("button", { name: "Dismiss notification" });
    fireEvent.focus(close);
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("closes from the close button", () => {
    setup();
    show({ title: "Saved", durationMs: null });
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByText("Saved")).toBeNull();
  });

  it("runs the action once and closes", () => {
    setup();
    const onClick = vi.fn();
    show({ title: "Removed", durationMs: null, action: { label: "Undo", onClick } });
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByText("Removed")).toBeNull();
  });

  it("dismisses by id from code", () => {
    setup();
    const id = show({ title: "Saved", durationMs: null });
    act(() => api.dismiss(id));
    expect(screen.queryByText("Saved")).toBeNull();
  });

  it("shows at most 3 and starts the others' timers only when they appear", () => {
    setup();
    for (let i = 1; i <= 5; i++) show({ title: `Toast ${i}`, durationMs: 1000 });
    expect(MAX_VISIBLE_TOASTS).toBe(3);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.queryByText("Toast 4")).toBeNull();
    act(() => vi.advanceTimersByTime(1200));
    expect(screen.getByText("Toast 4")).toBeInTheDocument();
    expect(screen.getByText("Toast 5")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByText("Toast 4")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByText("Toast 4")).toBeNull();
  });
});
