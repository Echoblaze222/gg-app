// @vitest-environment node
import { describe, expect, it } from "vitest";
import { base32ToBuffer, decodeClaims, errSummary, makeEmail, randomPassword, secondsUntilNextStep, stepOf, totpCode, utf8Length } from "../../scripts/security/prove-auth-lib.mjs";

// RFC 6238 appendix B, SHA-1, secret "12345678901234567890" (shown here in base32), last six digits of the 8 digit codes.
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("proof script helpers", () => {
  it("base32 decodes to the RFC secret", () => {
    expect(base32ToBuffer(RFC_SECRET).toString("ascii")).toBe("12345678901234567890");
    expect(base32ToBuffer("gezd gnbv====").toString("ascii")).toBe("12345");
  });
  it("base32 refuses characters outside its alphabet", () => {
    expect(() => base32ToBuffer("abc1")).toThrow();
  });
  it("totp matches the RFC 6238 test vectors", () => {
    const vectors: Array<[number, string]> = [[59, "287082"], [1111111109, "081804"], [1111111111, "050471"], [1234567890, "005924"], [2000000000, "279037"]];
    for (const [seconds, code] of vectors) expect(totpCode(RFC_SECRET, seconds * 1000)).toBe(code);
  });
  it("the code changes between 30 second windows and is stable inside one", () => {
    expect(totpCode(RFC_SECRET, 60_000)).toBe(totpCode(RFC_SECRET, 89_999));
    expect(totpCode(RFC_SECRET, 60_000)).not.toBe(totpCode(RFC_SECRET, 90_000));
  });
  it("window helpers", () => {
    expect(stepOf(59_999)).toBe(1);
    expect(stepOf(60_000)).toBe(2);
    expect(secondsUntilNextStep(60_000)).toBe(30);
    expect(secondsUntilNextStep(89_000)).toBe(1);
  });
  it("decodeClaims reads the payload and refuses a non token", () => {
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    expect(decodeClaims(`${b64({ a: 1 })}.${b64({ aal: "aal2", session_id: "s" })}.sig`)).toEqual({ aal: "aal2", session_id: "s" });
    expect(() => decodeClaims("nope")).toThrow();
  });
  it("makeEmail keeps the inbox and tags the run", () => {
    expect(makeEmail("pius@example.com", "ab12", "mfa")).toBe("pius+gg-proof-ab12-mfa@example.com");
    expect(() => makeEmail("nope", "r", "t")).toThrow();
    expect(() => makeEmail("@example.com", "r", "t")).toThrow();
    expect(() => makeEmail("pius@", "r", "t")).toThrow();
  });
  it("random passwords differ and are long enough", () => {
    const a = randomPassword(); const b = randomPassword();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(16);
  });
  it("utf8Length counts bytes", () => {
    expect(utf8Length("abc")).toBe(3);
    expect(utf8Length("é")).toBe(2);
  });
  it("errSummary never includes the message", () => {
    expect(errSummary({ status: 403, code: "session_not_found", message: "secret" } as never)).toBe("403 session_not_found");
    expect(errSummary(null)).toBe("no error");
    expect(errSummary({ name: "TypeError" })).toBe("? TypeError");
  });
});
