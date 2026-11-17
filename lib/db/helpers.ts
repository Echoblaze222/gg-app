import { isIP } from "node:net";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}[T ][0-9:.]+(Z|[+-]\d{2}(:?\d{2})?)$/;

/** inet columns reject anything that is not an address. A forged forwarded header must not break a write. */
export function cleanIp(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  return isIP(v) !== 0 ? v : null;
}

/** Cursor over (created_at, id), newest first. The timestamp is kept exactly as the database returned it. */
export function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`, "utf8").toString("base64url");
}

export function decodeCursor(cursor: string | null | undefined): { createdAt: string; id: string } | null {
  if (!cursor) return null;
  try {
    const [createdAt, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    if (!createdAt || !id || !UUID_RE.test(id) || !TIMESTAMP_RE.test(createdAt)) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

export function clampLimit(limit: number): number {
  return Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 100) : 20;
}

/** Keeps letters, digits, spaces and a few address characters, so the text is safe inside a filter expression. */
export function sanitizeSearch(text: string): string {
  return text.replace(/[^\p{L}\p{N} @._-]/gu, "").trim().slice(0, 80);
}

export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad|iOS/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "unknown device";
  return `${browser} on ${os}`;
}
