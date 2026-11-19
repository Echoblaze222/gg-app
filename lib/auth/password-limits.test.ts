// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isPasswordAcceptable } from "./password";

const who = { email: "chidi@example.com", fullName: "Chidi Eze" };
const base = "plum-river-kettle-47"; // 20 characters, passes every other rule

describe("password length limits (provider hashes only 72 bytes)", () => {
  it("accepts exactly 72 bytes and rejects 73", () => {
    const p72 = (base + base + base + "plum-river-k").slice(0, 72);
    expect(Buffer.byteLength(p72)).toBe(72);
    expect(isPasswordAcceptable(p72, who)).toBe(true);
    expect(isPasswordAcceptable(p72 + "x", who)).toBe(false);
  });
  it("counts bytes, not characters", () => {
    const pairs = "éü".repeat(18); // 36 characters, 72 bytes
    expect(Buffer.byteLength(pairs)).toBe(72);
    expect(isPasswordAcceptable(pairs, who)).toBe(true);
    const over = pairs + "é"; // 37 characters, 74 bytes
    expect(over.length).toBeLessThan(72);
    expect(isPasswordAcceptable(over, who)).toBe(false);
  });
  it("still rejects anything under 10 characters", () => {
    expect(isPasswordAcceptable("plum-rive", who)).toBe(false);
    expect(isPasswordAcceptable("plum-river", who)).toBe(true);
  });
});
