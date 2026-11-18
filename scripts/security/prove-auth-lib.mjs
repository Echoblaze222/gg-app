// Helpers for prove-auth.mjs. Pure functions, unit tested in tests/security/prove-auth-lib.test.ts.
import { createHmac, randomBytes } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32ToBuffer(input) {
  const clean = input.replace(/=+$/, "").replace(/\s+/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error("not base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
      value &= (1 << bits) - 1;
    }
  }
  return Buffer.from(out);
}

/** RFC 6238 time based one time password (SHA-1, as authenticator apps use). */
export function totpCode(secretBase32, timeMs, { digits = 6, step = 30 } = {}) {
  const counter = BigInt(Math.floor(timeMs / 1000 / step));
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(counter);
  const hash = createHmac("sha1", base32ToBuffer(secretBase32)).update(msg).digest();
  const offset = hash[hash.length - 1] & 0xf;
  const bin = ((hash[offset] & 0x7f) << 24) | (hash[offset + 1] << 16) | (hash[offset + 2] << 8) | hash[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export const stepOf = (timeMs, step = 30) => Math.floor(timeMs / 1000 / step);
export const secondsUntilNextStep = (timeMs, step = 30) => step - (Math.floor(timeMs / 1000) % step);

/** Reads the claims of a token WITHOUT verifying it. The script only uses this on tokens it just received. */
export function decodeClaims(jwt) {
  const parts = String(jwt).split(".");
  if (parts.length !== 3) throw new Error("not a token");
  return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
}

/** name@host -> name+gg-proof-<run>-<tag>@host. Plus addressing lands in the same inbox. */
export function makeEmail(base, runId, tag) {
  const at = base.lastIndexOf("@");
  if (at < 1 || at === base.length - 1) throw new Error("PROOF_EMAIL_BASE must look like name@example.com");
  return `${base.slice(0, at)}+gg-proof-${runId}-${tag}${base.slice(at)}`;
}

export const randomPassword = () => `${randomBytes(12).toString("base64url")}-aZ9!`;
export const utf8Length = (s) => Buffer.byteLength(s, "utf8");

/** Short, safe description of an error: status and code only, never the message. */
export function errSummary(e) {
  if (!e) return "no error";
  return `${e.status ?? "?"} ${e.code ?? e.name ?? "error"}`;
}
