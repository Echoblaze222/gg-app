// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { createHmacWebhookVerifier } from "./webhook";

const secret = "whsec_test_secret";
const body = JSON.stringify({ event: "charge.success", data: { reference: "ref_1" } });
const sign = (algo: "sha256" | "sha512", enc: "hex" | "base64", b = body, s = secret) => createHmac(algo, s).update(b).digest(enc);

describe("createHmacWebhookVerifier", () => {
  const v512 = createHmacWebhookVerifier({ algorithm: "sha512", encoding: "hex" });

  it("accepts a correct signature", () => {
    expect(v512.verify({ rawBody: body, signatureHeader: sign("sha512", "hex"), secret })).toBe(true);
  });
  it("supports sha256 and base64 when configured", () => {
    const v = createHmacWebhookVerifier({ algorithm: "sha256", encoding: "base64" });
    expect(v.verify({ rawBody: body, signatureHeader: sign("sha256", "base64"), secret })).toBe(true);
  });
  it("rejects a body changed by one byte", () => {
    expect(v512.verify({ rawBody: body + " ", signatureHeader: sign("sha512", "hex"), secret })).toBe(false);
  });
  it("rejects a signature made with another secret", () => {
    expect(v512.verify({ rawBody: body, signatureHeader: sign("sha512", "hex", body, "other"), secret })).toBe(false);
  });
  it("rejects a missing or empty header", () => {
    expect(v512.verify({ rawBody: body, signatureHeader: null, secret })).toBe(false);
    expect(v512.verify({ rawBody: body, signatureHeader: "", secret })).toBe(false);
  });
  it("rejects an empty secret even if the attacker also signs with an empty secret", () => {
    expect(v512.verify({ rawBody: body, signatureHeader: sign("sha512", "hex", body, ""), secret: "" })).toBe(false);
  });
  it("rejects wrong length and non hex input without throwing", () => {
    expect(v512.verify({ rawBody: body, signatureHeader: "abcd", secret })).toBe(false);
    expect(v512.verify({ rawBody: body, signatureHeader: "z".repeat(128), secret })).toBe(false);
  });
  it("accepts uppercase hex (same bytes)", () => {
    expect(v512.verify({ rawBody: body, signatureHeader: sign("sha512", "hex").toUpperCase(), secret })).toBe(true);
  });
  it("rejects a signature from a different algorithm", () => {
    expect(v512.verify({ rawBody: body, signatureHeader: sign("sha256", "hex"), secret })).toBe(false);
  });
  it("trims surrounding whitespace in the header", () => {
    expect(v512.verify({ rawBody: body, signatureHeader: ` ${sign("sha512", "hex")}\n`, secret })).toBe(true);
  });
});
