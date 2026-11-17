const COMMON = new Set([
  "password", "password1", "password12", "password123", "passw0rd", "p@ssw0rd", "qwertyuiop", "qwerty123", "qwertyuiopasdf",
  "1234567890", "12345678910", "0123456789", "1q2w3e4r5t", "iloveyou12", "welcome123", "welcome1234", "admin12345", "letmein123",
  "abc1234567", "monkey1234", "dragon1234", "football12", "baseball12", "superman12", "trustno1234", "changeme123", "nigeria123",
  "lagos12345", "godisgood12", "godsgrace12", "blessing123", "chukwu1234", "11111111111", "00000000000", "9876543210",
]);

const SEQUENCES = ["abcdefghijklmnopqrstuvwxyz", "0123456789", "qwertyuiopasdfghjklzxcvbnm"];

/** The provider hashes with bcrypt, which only uses the first 72 bytes, and refuses longer passwords. */
const MAX_BYTES = 72;
const MIN_CHARS = 10;

function isSequence(p: string): boolean {
  return SEQUENCES.some((s) => s.includes(p) || [...s].reverse().join("").includes(p));
}

/** Local strength check. Not a breached password lookup (see docs/security/04-auth-service-spec.md). */
export function isPasswordAcceptable(password: string, who: { email: string; fullName: string }): boolean {
  if (password.length < MIN_CHARS) return false;
  // Bytes, not characters: non-ASCII characters take two or more bytes.
  if (new TextEncoder().encode(password).length > MAX_BYTES) return false;
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return false;
  if (/^(.)\1+$/.test(lower)) return false;
  if (isSequence(lower)) return false;

  const emailName = who.email.split("@")[0]?.toLowerCase() ?? "";
  if (emailName.length >= 4 && lower.includes(emailName)) return false;
  const squashed = who.fullName.toLowerCase().replace(/[^a-z]/g, "");
  if (squashed.length >= 4 && lower.replace(/[^a-z]/g, "").includes(squashed)) return false;
  for (const part of who.fullName.toLowerCase().split(/\s+/)) {
    if (part.length >= 5 && lower.includes(part)) return false;
  }
  return true;
}

/** Returns +234XXXXXXXXXX or null. Accepts 0XXXXXXXXXX and +234XXXXXXXXXX mobile numbers. */
export function normalizeNigerianPhone(input: string): string | null {
  const v = input.trim();
  const m = /^(?:\+234|0)([789][01]\d{8})$/.exec(v);
  return m ? `+234${m[1]}` : null;
}
