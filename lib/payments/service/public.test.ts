import { describe, expect, it } from "vitest";
import { DEFAULT_ALLOWED_CHECKOUT_HOSTS, checkoutUrlFor, isAllowedCheckoutUrl, parseAllowedHosts, toPublicAttempt } from "./public";
import type { PaymentAttemptV11 } from "@/contracts/v1_1";

const HOSTS = DEFAULT_ALLOWED_CHECKOUT_HOSTS;

describe("isAllowedCheckoutUrl", () => {
  it("accepts only https on an exact allowed host", () => {
    expect(isAllowedCheckoutUrl("https://checkout.paystack.com/3ni8kdavz62431k", HOSTS)).toBe(true);
    expect(isAllowedCheckoutUrl("https://CHECKOUT.PAYSTACK.COM/abc", HOSTS)).toBe(true); // hosts are case insensitive
  });

  it("rejects lookalikes, subdomain tricks, userinfo tricks, http, ports, junk and empty", () => {
    for (const url of [
      "http://checkout.paystack.com/abc",
      "https://checkout.paystack.com.evil.example/abc",
      "https://evilcheckout.paystack.com/abc",
      "https://checkout.paystack.com@evil.example/abc",
      "https://user:pw@checkout.paystack.com/abc",
      "https://checkout.paystack.com:444/abc",
      "javascript:alert(1)",
      "//checkout.paystack.com/abc",
      "not a url",
      "",
    ]) {
      expect(isAllowedCheckoutUrl(url, HOSTS), url).toBe(false);
    }
  });
});

describe("parseAllowedHosts", () => {
  it("reads a JSON array or a comma list, lowercases, and drops anything that is not a host name", () => {
    expect(parseAllowedHosts('["Checkout.Example.com","pay.example.org"]')).toEqual(["checkout.example.com", "pay.example.org"]);
    expect(parseAllowedHosts("checkout.example.com, pay.example.org")).toEqual(["checkout.example.com", "pay.example.org"]);
    expect(parseAllowedHosts('["ok.example.com","https://not-a-host.com/path","*.example.com",5]')).toEqual(["ok.example.com"]);
  });

  it("falls back to the default, never to an open list, for missing, empty or unusable values", () => {
    for (const raw of [null, "", "   ", "[]", "[1,2]", "localhost", "[not json,,", '""']) {
      expect(parseAllowedHosts(raw), String(raw)).toEqual(DEFAULT_ALLOWED_CHECKOUT_HOSTS);
    }
  });
});

describe("checkoutUrlFor", () => {
  it("builds the link as host plus access code, matching the provider's documented sample", () => {
    expect(checkoutUrlFor("3ni8kdavz62431k")).toBe("https://checkout.paystack.com/3ni8kdavz62431k");
  });

  it("returns null for a missing code or one that could smuggle path, query or host", () => {
    for (const code of [null, "", "abc", "../x", "a/b/c/d", "abc?x=1", "abc#frag", "abc def", "x".repeat(65)]) {
      expect(checkoutUrlFor(code), String(code)).toBeNull();
    }
  });
});

describe("toPublicAttempt", () => {
  it("copies the contract fields and nothing else, even if the stored row grows a new field", () => {
    const stored = {
      id: "i", memberId: "m", purpose: "one_time_contribution", channel: null, amountKobo: 1, currency: "NGN", status: "initiating",
      reference: "gg-x", idempotencyKey: "k", obligationId: null, paymentMethodId: null, providerTransactionId: null, failureCode: null,
      createdAt: "t", updatedAt: "t", completedAt: null, providerAccessCode: "SECRET", futureInternalField: "SECRET2",
    } as unknown as PaymentAttemptV11;
    const out = toPublicAttempt(stored);
    expect(JSON.stringify(out)).not.toContain("SECRET");
    expect(Object.keys(out).sort()).toEqual(
      ["amountKobo", "channel", "completedAt", "createdAt", "currency", "failureCode", "id", "idempotencyKey", "memberId", "obligationId", "paymentMethodId", "providerTransactionId", "purpose", "reference", "status", "updatedAt"].sort(),
    );
  });
});
