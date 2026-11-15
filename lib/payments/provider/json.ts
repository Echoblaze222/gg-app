/**
 * Paystack documents transaction ids as unsigned 64 bit integers. JSON.parse reads numbers as doubles,
 * which silently rounds above 2^53. This quotes long integer `id` values before parsing so they
 * arrive as exact strings. Only `"id": <16 or more digits>` outside of string content is touched.
 */
const LONG_ID = /("id"\s*:\s*)(\d{16,})(?=\s*[,}\]])/g;

export function quoteLongIds(text: string): string {
  return text.replace(LONG_ID, '$1"$2"');
}

/** Parses JSON with exact long ids. Returns null when the text is not valid JSON. */
export function parseProviderJson(text: string): unknown {
  try {
    return JSON.parse(quoteLongIds(text));
  } catch {
    return null;
  }
}
