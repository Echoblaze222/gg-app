import { describe, expect, it } from "vitest";
import { idempotencyKeySchema } from "@/contracts/schemas";
import { BASE32_ALPHABET, randomBase32, type RandomBytes } from "./random";
import {
  MAX_CHARGE_ATTEMPT_NO,
  chargeIdempotencyKey,
  generateReceiptNumber,
  generateReference,
  isValidReceiptNumber,
  isValidReference,
} from "./reference";

/** Deterministic byte source: yields the given bytes repeatedly. */
function fixedBytes(pattern: number[]): RandomBytes {
  return (size) => Uint8Array.from({ length: size }, (_, i) => pattern[i % pattern.length] ?? 0);
}

/** Small seeded generator so tests are repeatable without a dependency. */
function seededBytes(seed: number): RandomBytes {
  let state = seed >>> 0;
  return (size) =>
    Uint8Array.from({ length: size }, () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state >>> 24;
    });
}

describe("randomBase32", () => {
  it("maps known bytes to known characters", () => {
    // 0x00 bytes give all zeros, 0xff bytes give all 31s (the last alphabet character, Z).
    expect(randomBase32(8, fixedBytes([0x00]))).toBe("00000000");
    expect(randomBase32(8, fixedBytes([0xff]))).toBe("ZZZZZZZZ");
  });

  it("matches known answer vectors computed by an independent implementation", () => {
    const bytes = (values: number[]): RandomBytes => () => Uint8Array.from(values);
    expect(randomBase32(20, bytes([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0x11, 0x22, 0x33, 0x44, 0x55]))).toBe("28T5CY4TQKFF04926D25");
    expect(randomBase32(8, bytes([0xde, 0xad, 0xbe, 0xef, 0x01]))).toBe("VTPVXVR1");
    expect(randomBase32(20, bytes([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c]))).toBe("000G40R40M30E209185G");
  });

  it("packs five bits per character from the first byte", () => {
    // The first character is the top five bits of the first byte: 10101 = 21.
    expect(randomBase32(1, fixedBytes([0b10101010]))).toBe(BASE32_ALPHABET[21]);
  });

  it("returns exactly the requested length and only alphabet characters", () => {
    for (let length = 1; length <= 64; length += 1) {
      const out = randomBase32(length, seededBytes(length));
      expect(out).toHaveLength(length);
      for (const ch of out) expect(BASE32_ALPHABET.includes(ch)).toBe(true);
    }
  });

  it("asks the source for the minimum number of bytes", () => {
    const sizes: number[] = [];
    const spy: RandomBytes = (size) => {
      sizes.push(size);
      return new Uint8Array(size);
    };
    randomBase32(20, spy);
    randomBase32(8, spy);
    expect(sizes).toEqual([13, 5]);
  });

  it("covers every character of the alphabet with a uniform spread", () => {
    const counts = new Map<string, number>();
    const source = seededBytes(7);
    for (let i = 0; i < 4000; i += 1) {
      for (const ch of randomBase32(10, source)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }
    expect(counts.size).toBe(32);
    const expected = (4000 * 10) / 32;
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(expected * 0.8);
      expect(count).toBeLessThan(expected * 1.2);
    }
  });

  it("rejects a bad length and a short source", () => {
    expect(() => randomBase32(0)).toThrow(RangeError);
    expect(() => randomBase32(65)).toThrow(RangeError);
    expect(() => randomBase32(1.5)).toThrow(RangeError);
    expect(() => randomBase32(8, () => new Uint8Array(1))).toThrow("too few bytes");
  });

  it("works with the real node crypto source", () => {
    expect(randomBase32(20)).toMatch(/^[0-9A-HJKMNP-TV-Z]{20}$/);
  });
});

describe("generateReference", () => {
  it("has the gg- prefix, 20 characters and only provider safe characters", () => {
    const ref = generateReference(seededBytes(1));
    expect(ref).toMatch(/^gg-[0-9A-HJKMNP-TV-Z]{20}$/);
    expect(isValidReference(ref)).toBe(true);
    // Paystack allows letters, digits, "-", "." and "=" only.
    expect(ref).toMatch(/^[A-Za-z0-9.=-]+$/);
  });

  it("does not collide across 20000 draws", () => {
    const source = seededBytes(99);
    const seen = new Set<string>();
    for (let i = 0; i < 20_000; i += 1) seen.add(generateReference(source));
    expect(seen.size).toBe(20_000);
  });

  it("two real references differ", () => {
    expect(generateReference()).not.toBe(generateReference());
  });

  it("rejects lookalikes", () => {
    expect(isValidReference("gg-")).toBe(false);
    expect(isValidReference("GG-00000000000000000000")).toBe(false);
    expect(isValidReference("gg-0000000000000000000I")).toBe(false);
    expect(isValidReference("gg-0000000000000000000")).toBe(false);
    expect(isValidReference("gg-000000000000000000000")).toBe(false);
    expect(isValidReference("xx-00000000000000000000")).toBe(false);
  });
});

describe("generateReceiptNumber", () => {
  it("uses the Lagos date as YYMMDD", () => {
    expect(generateReceiptNumber(new Date("2026-11-14T12:00:00Z"), fixedBytes([0]))).toBe("GG-261114-00000000");
  });

  it("rolls to the next Lagos day from 23:00 UTC", () => {
    expect(generateReceiptNumber(new Date("2026-12-31T23:30:00Z"), fixedBytes([0]))).toBe("GG-270101-00000000");
  });

  it("matches the pattern and validates", () => {
    const n = generateReceiptNumber(new Date("2026-11-14T08:00:00Z"), seededBytes(3));
    expect(isValidReceiptNumber(n)).toBe(true);
  });

  it("does not collide across 20000 draws on one day", () => {
    const source = seededBytes(5);
    const seen = new Set<string>();
    const now = new Date("2026-11-14T08:00:00Z");
    for (let i = 0; i < 20_000; i += 1) seen.add(generateReceiptNumber(now, source));
    expect(seen.size).toBe(20_000);
  });

  it("rejects lookalikes", () => {
    expect(isValidReceiptNumber("GG-261114-0000000")).toBe(false);
    expect(isValidReceiptNumber("GG-26111-00000000")).toBe(false);
    expect(isValidReceiptNumber("gg-261114-00000000")).toBe(false);
    expect(isValidReceiptNumber("GG-261114-0000000U")).toBe(false);
  });
});

describe("chargeIdempotencyKey", () => {
  const obligationId = "3f2b8c1e-5d4a-4e7b-9a1c-0d2e3f4a5b6c";

  it("is deterministic for the same obligation and attempt", () => {
    expect(chargeIdempotencyKey(obligationId, 1)).toBe(`chg-${obligationId}-1`);
    expect(chargeIdempotencyKey(obligationId, 1)).toBe(chargeIdempotencyKey(obligationId, 1));
  });

  it("differs per attempt number and per obligation", () => {
    expect(chargeIdempotencyKey(obligationId, 1)).not.toBe(chargeIdempotencyKey(obligationId, 2));
    expect(chargeIdempotencyKey(obligationId, 1)).not.toBe(chargeIdempotencyKey("9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d", 1));
  });

  it("satisfies the frozen contract schema for every allowed attempt number", () => {
    for (let n = 1; n <= MAX_CHARGE_ATTEMPT_NO; n += 1) {
      expect(idempotencyKeySchema.safeParse(chargeIdempotencyKey(obligationId, n)).success).toBe(true);
    }
  });

  it("rejects bad input", () => {
    expect(() => chargeIdempotencyKey("not-a-uuid", 1)).toThrow(RangeError);
    expect(() => chargeIdempotencyKey(obligationId, 0)).toThrow(RangeError);
    expect(() => chargeIdempotencyKey(obligationId, MAX_CHARGE_ATTEMPT_NO + 1)).toThrow(RangeError);
    expect(() => chargeIdempotencyKey(obligationId, 1.5)).toThrow(RangeError);
  });
});
