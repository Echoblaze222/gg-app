/** Removes secret looking values before anything is written to an audit row or a log. */

const SENSITIVE_KEY =
  /(pass(word|wd)?|secret|token|authorization|cookie|otp|cvv|card|api[-_]?key|signature|credential|private[-_]?key)/i;
const EXACT_SENSITIVE_KEY = /^pin$/i;

const MAX_DEPTH = 6;
const MAX_KEYS = 50;
const MAX_ITEMS = 50;
const MAX_STRING = 500;
export const MAX_DETAIL_CHARS = 8000;

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key) || EXACT_SENSITIVE_KEY.test(key);
}

function clean(value: unknown, depth: number): unknown {
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}...[cut]` : value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol") return undefined;
  if (depth >= MAX_DEPTH) return "[too deep]";
  if (Array.isArray(value)) return value.slice(0, MAX_ITEMS).map((v) => clean(v, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).slice(0, MAX_KEYS)) {
      if (key === "__proto__") continue;
      out[key] = isSensitiveKey(key) ? "[redacted]" : clean((value as Record<string, unknown>)[key], depth + 1);
    }
    return out;
  }
  return undefined;
}

/** Returns a safe, size capped copy of `detail`. Never throws. */
export function redactDetail(detail: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (detail === undefined) return undefined;
  try {
    const cleaned = clean(detail, 0) as Record<string, unknown>;
    const size = JSON.stringify(cleaned).length;
    if (size > MAX_DETAIL_CHARS) return { _truncated: true, _chars: size };
    return cleaned;
  } catch {
    return { _unserializable: true };
  }
}
