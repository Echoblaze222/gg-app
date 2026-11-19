// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isPasswordAcceptable, normalizeNigerianPhone } from "./password";

const ctx = { email: "ada.obi@example.com", fullName: "Ada Obi" };

describe("isPasswordAcceptable", () => {
  it("accepts a long unusual passphrase", () => {
    expect(isPasswordAcceptable("plum-river-kettle-47", ctx)).toBe(true);
  });
  it("rejects short and very long passwords", () => {
    expect(isPasswordAcceptable("Ab1!xyz", ctx)).toBe(false);
    expect(isPasswordAcceptable("a1".repeat(70), ctx)).toBe(false);
  });
  it("rejects common passwords in any case", () => {
    expect(isPasswordAcceptable("Password123", ctx)).toBe(false);
    expect(isPasswordAcceptable("QWERTYUIOP", ctx)).toBe(false);
    expect(isPasswordAcceptable("1234567890", ctx)).toBe(false);
  });
  it("rejects one repeated character and simple sequences", () => {
    expect(isPasswordAcceptable("aaaaaaaaaaaa", ctx)).toBe(false);
    expect(isPasswordAcceptable("abcdefghijkl", ctx)).toBe(false);
  });
  it("rejects passwords containing the email name or the person's name", () => {
    expect(isPasswordAcceptable("xx-ada.obi-xx-77", ctx)).toBe(false);
    expect(isPasswordAcceptable("my-name-is-Ada-Obi", ctx)).toBe(false);
  });
});

describe("normalizeNigerianPhone", () => {
  it("normalises local and international forms to +234", () => {
    expect(normalizeNigerianPhone("08031234567")).toBe("+2348031234567");
    expect(normalizeNigerianPhone("+2348031234567")).toBe("+2348031234567");
  });
  it("rejects anything else", () => {
    expect(normalizeNigerianPhone("12345")).toBeNull();
    expect(normalizeNigerianPhone("+14155550123")).toBeNull();
    expect(normalizeNigerianPhone("0803123456x")).toBeNull();
  });
});
