import { describe, expect, it } from "vitest";
import { cleanIp, clampLimit, decodeCursor, deviceLabel, encodeCursor, sanitizeSearch } from "./helpers";

describe("db helpers", () => {
  it("keeps only real addresses for inet columns", () => {
    expect(cleanIp("203.0.113.9")).toBe("203.0.113.9");
    expect(cleanIp("2001:db8::1")).toBe("2001:db8::1");
    expect(cleanIp("unknown")).toBeNull();
    expect(cleanIp("1.2.3.4, 5.6.7.8")).toBeNull();
    expect(cleanIp(null)).toBeNull();
  });

  it("round trips a cursor and rejects tampered ones", () => {
    const id = "2f1f6a40-6f4e-4c53-9a0a-0f5d2d5b9a11";
    const ts = "2026-11-17T21:26:00.123456+00:00";
    expect(decodeCursor(encodeCursor(ts, id))).toEqual({ createdAt: ts, id });
    expect(decodeCursor(Buffer.from("x),id.eq.1|" + id).toString("base64url"))).toBeNull();
    expect(decodeCursor(Buffer.from(`${ts}|not-a-uuid`).toString("base64url"))).toBeNull();
    expect(decodeCursor("%%%")).toBeNull();
    expect(decodeCursor(null)).toBeNull();
  });

  it("clamps page sizes", () => {
    expect(clampLimit(0)).toBe(1);
    expect(clampLimit(5000)).toBe(100);
    expect(clampLimit(Number.NaN)).toBe(20);
    expect(clampLimit(25)).toBe(25);
  });

  it("strips filter syntax from search text", () => {
    expect(sanitizeSearch("ada,or(id.eq.1)%*")).toBe("adaorid.eq.1");
    expect(sanitizeSearch("  Ada Obi ")).toBe("Ada Obi");
  });

  it("labels devices from the user agent", () => {
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Safari/604.1")).toBe("Safari on iOS");
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36")).toBe("Chrome on Windows");
    expect(deviceLabel(null)).toBe("Browser on unknown device");
  });
});
