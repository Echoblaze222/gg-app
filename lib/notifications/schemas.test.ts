import { describe, expect, it } from "vitest";
import { fieldsFromZod, notifyInputSchema } from "./schemas";

const valid = {
  memberId: "11111111-1111-4111-8111-111111111111",
  type: "announcement",
  title: "Hello",
  body: "A short message.",
} as const;

describe("notifyInputSchema text rules", () => {
  it("accepts normal text", () => {
    expect(notifyInputSchema.safeParse(valid).success).toBe(true);
  });

  it.each([["title"], ["body"]] as const)("rejects a NUL character in the %s with a field message", (field) => {
    const result = notifyInputSchema.safeParse({ ...valid, [field]: "bad\u0000text" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldsFromZod(result.error)[field]).toBeDefined();
    }
  });

  it("still enforces length after trimming", () => {
    expect(notifyInputSchema.safeParse({ ...valid, title: "   " }).success).toBe(false);
    expect(notifyInputSchema.safeParse({ ...valid, title: "x".repeat(121) }).success).toBe(false);
    expect(notifyInputSchema.safeParse({ ...valid, body: "x".repeat(1001) }).success).toBe(false);
  });
});
