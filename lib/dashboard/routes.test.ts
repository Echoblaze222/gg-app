import { describe, expect, it } from "vitest";
import { isBuiltRoute } from "./routes";

describe("isBuiltRoute", () => {
  it("accepts screens that exist, including a receipt page", () => {
    for (const l of ["/app", "/app/pay", "/app/history", "/app/notifications", "/app/history/GG-0001"]) expect(isBuiltRoute(l)).toBe(true);
  });
  it("rejects screens that do not exist yet, so no link points at a missing page", () => {
    for (const l of ["/app/withdrawals", "/app/support/123", "/app/history/", "/admin", "https://evil.example", "", null, undefined]) expect(isBuiltRoute(l)).toBe(false);
  });
});
