import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDelayedFlag } from "./use-delayed-flag";
import { useReducedMotion } from "./use-reduced-motion";

afterEach(cleanup);

describe("useDelayedFlag", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("stays false for fast work and never flashes", () => {
    const { result, rerender } = renderHook(({ active }) => useDelayedFlag(active, 300), { initialProps: { active: true } });
    act(() => vi.advanceTimersByTime(299));
    expect(result.current).toBe(false);
    rerender({ active: false });
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(false);
  });

  it("turns true after the delay and false as soon as work ends", () => {
    const { result, rerender } = renderHook(({ active }) => useDelayedFlag(active, 300), { initialProps: { active: true } });
    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe(true);
    rerender({ active: false });
    expect(result.current).toBe(false);
  });

  it("starts the delay again on the next run", () => {
    const { result, rerender } = renderHook(({ active }) => useDelayedFlag(active, 300), { initialProps: { active: true } });
    act(() => vi.advanceTimersByTime(300));
    rerender({ active: false });
    rerender({ active: true });
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe(true);
  });
});

describe("useReducedMotion", () => {
  const original = window.matchMedia;
  afterEach(() => {
    window.matchMedia = original;
  });

  function mockMedia(initial: boolean) {
    let matches = initial;
    const listeners = new Set<() => void>();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      get matches() {
        return matches;
      },
      media: query,
      addEventListener: (_: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    })) as unknown as typeof window.matchMedia;
    return {
      set(next: boolean) {
        matches = next;
        listeners.forEach((cb) => cb());
      },
    };
  }

  it("is false when matchMedia is unavailable", () => {
    // @ts-expect-error simulating an old browser
    window.matchMedia = undefined;
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it("reads the system setting", () => {
    mockMedia(true);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it("updates live when the setting changes", () => {
    const media = mockMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    act(() => media.set(true));
    expect(result.current).toBe(true);
  });
});
