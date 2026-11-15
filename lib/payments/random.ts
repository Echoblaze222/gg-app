import { randomBytes as nodeRandomBytes } from "node:crypto";

/** Source of random bytes. Injected so tests are deterministic. Production uses node:crypto. */
export type RandomBytes = (size: number) => Uint8Array;

export const defaultRandomBytes: RandomBytes = (size) => nodeRandomBytes(size);

/** Crockford base32: digits and capital letters without I, L, O and U. */
export const BASE32_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * `length` characters of uniformly random base32, 5 bits per character, with no modulo bias
 * because 32 divides 256 evenly after bit packing. Throws if the source returns too few bytes.
 */
export function randomBase32(length: number, randomBytes: RandomBytes = defaultRandomBytes): string {
  if (!Number.isInteger(length) || length < 1 || length > 64) {
    throw new RangeError("length must be an integer from 1 to 64");
  }
  const needed = Math.ceil((length * 5) / 8);
  const bytes = randomBytes(needed);
  if (bytes.length < needed) throw new Error("random source returned too few bytes");

  // `buffer` is a 32 bit window. Old high bits fall off the left as it shifts, and `& 31` below
  // reads only the five bits that matter, so no explicit mask is needed.
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < needed && out.length < length; i += 1) {
    buffer = (buffer << 8) | (bytes[i] ?? 0);
    bits += 8;
    while (bits >= 5 && out.length < length) {
      out += BASE32_ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out;
}
