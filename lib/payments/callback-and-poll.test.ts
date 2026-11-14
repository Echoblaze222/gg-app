import { describe, expect, it } from "vitest";
import { DEFAULT_AUTHORIZATION_HOSTS, isSafeAuthorizationUrl, parsePaymentReturn } from "./callback";
import { MAX_POLLS, POLL_BASE_DELAYS_MS, pollDelayMs } from "./poll";

describe("parsePaymentReturn", () => {
  it("accepts the provider shape with both parameters equal", () => {
    expect(parsePaymentReturn("?trxref=GG_ref-123456&reference=GG_ref-123456")).toEqual({ ok: true, reference: "GG_ref-123456" });
  });

  it("accepts either parameter alone, and works without the leading question mark", () => {
    expect(parsePaymentReturn("reference=abc123.def")).toEqual({ ok: true, reference: "abc123.def" });
    expect(parsePaymentReturn("?trxref=abc123=")).toEqual({ ok: true, reference: "abc123=" });
  });

  it("keeps working when our own parameters are present", () => {
    expect(parsePaymentReturn("?next=%2Fapp&trxref=abcdef&reference=abcdef")).toEqual({ ok: true, reference: "abcdef" });
  });

  it.each([[""], ["?"], ["?foo=bar"]])("reports missing for %j", (search) => {
    expect(parsePaymentReturn(search)).toEqual({ ok: false, reason: "missing" });
  });

  it("rejects a mismatch between the two parameters", () => {
    expect(parsePaymentReturn("?trxref=abcdef&reference=ghijkl")).toEqual({ ok: false, reason: "mismatch" });
  });

  it.each([
    ["?reference=a&reference=b"],
    ["?trxref=abcdef&trxref=abcdef"],
    ["?reference=short"],
    ["?reference=" + "a".repeat(101)],
    ["?reference=abc%20def%20ghi"],
    ["?reference=..%2F..%2Fadmin"],
    ["?reference=<script>alert(1)</script>"],
    ["?reference="],
  ])("rejects an invalid reference without looking it up: %s", (search) => {
    expect(parsePaymentReturn(search)).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("isSafeAuthorizationUrl", () => {
  it("allows an https url on the provider host", () => {
    expect(isSafeAuthorizationUrl("https://checkout.paystack.com/abc123")).toBe(true);
    expect(isSafeAuthorizationUrl("https://CHECKOUT.PAYSTACK.COM/abc123?x=1")).toBe(true);
  });

  it.each([
    ["http://checkout.paystack.com/abc"],
    ["javascript:alert(1)"],
    ["data:text/html,hi"],
    ["//checkout.paystack.com/abc"],
    ["https://checkout.paystack.com.evil.example/abc"],
    ["https://evilcheckout.paystack.com/abc"],
    ["https://checkout.paystack.com@evil.example/abc"],
    ["https://user:pass@checkout.paystack.com/abc"],
    ["https://checkout.paystack.com:8443/abc"],
    ["https://evil.example/https://checkout.paystack.com"],
    ["not a url"],
    [""],
  ])("rejects %s", (url) => {
    expect(isSafeAuthorizationUrl(url)).toBe(false);
  });

  it("uses the host list it is given", () => {
    expect(isSafeAuthorizationUrl("https://pay.example.com/x", ["pay.example.com"])).toBe(true);
    expect(isSafeAuthorizationUrl("https://checkout.paystack.com/x", ["pay.example.com"])).toBe(false);
    expect(DEFAULT_AUTHORIZATION_HOSTS).toContain("checkout.paystack.com");
  });
});

describe("pollDelayMs", () => {
  it("backs off and stays within the jitter band", () => {
    for (let i = 0; i < MAX_POLLS; i += 1) {
      const base = POLL_BASE_DELAYS_MS[i] as number;
      expect(pollDelayMs(i, () => 0)).toBe(Math.round(base * 0.8));
      expect(pollDelayMs(i, () => 0.999999)).toBe(Math.round(base * 1.2));
    }
  });

  it("never decreases between polls at the same random value", () => {
    let previous = 0;
    for (let i = 0; i < MAX_POLLS; i += 1) {
      const delay = pollDelayMs(i, () => 0.5) as number;
      expect(delay).toBeGreaterThan(previous);
      previous = delay;
    }
  });

  it("returns null once polling is exhausted", () => {
    expect(pollDelayMs(MAX_POLLS, () => 0.5)).toBeNull();
    expect(pollDelayMs(MAX_POLLS + 10, () => 0.5)).toBeNull();
  });

  it("clamps a bad random source instead of producing a wild delay", () => {
    const base = POLL_BASE_DELAYS_MS[0] as number;
    expect(pollDelayMs(0, () => 5)).toBe(Math.round(base * 1.2));
    expect(pollDelayMs(0, () => -5)).toBe(Math.round(base * 0.8));
    expect(pollDelayMs(0, () => Number.NaN)).toBe(base);
  });

  it("rejects a bad index", () => {
    expect(() => pollDelayMs(-1, () => 0.5)).toThrow(RangeError);
    expect(() => pollDelayMs(1.5, () => 0.5)).toThrow(RangeError);
  });

  it("totals under a minute", () => {
    expect(POLL_BASE_DELAYS_MS.reduce((a, b) => a + b, 0) * 1.2).toBeLessThan(70_000);
  });
});
