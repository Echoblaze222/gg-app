/**
 * Handling of the provider redirect back to us.
 * Rule: a redirect proves nothing. It only tells us which reference to verify with the server.
 */

/** ASSUMED format. AI-4 owns reference generation. Adjust here if their format is outside this range. */
export const REFERENCE_PATTERN = /^[A-Za-z0-9._=-]{6,100}$/;

export type ReturnParse =
  | { readonly ok: true; readonly reference: string }
  | { readonly ok: false; readonly reason: "missing" | "invalid" | "mismatch" };

/**
 * Reads `reference` and `trxref` from the callback query string. The provider sends both with the same value.
 * Repeated parameters, a mismatch between the two, or an unusual format are all rejected without any lookup.
 */
export function parsePaymentReturn(search: string): ReturnParse {
  const params = new URLSearchParams(search);
  const references = params.getAll("reference");
  const trxrefs = params.getAll("trxref");
  if (references.length > 1 || trxrefs.length > 1) {
    return { ok: false, reason: "invalid" };
  }
  const reference = references[0];
  const trxref = trxrefs[0];
  if (reference === undefined && trxref === undefined) {
    return { ok: false, reason: "missing" };
  }
  if (reference !== undefined && trxref !== undefined && reference !== trxref) {
    return { ok: false, reason: "mismatch" };
  }
  const value = reference ?? trxref;
  if (value === undefined || !REFERENCE_PATTERN.test(value)) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true, reference: value };
}

/** ASSUMED host. Confirm against AI-4 and the provider before launch, and move it to configuration. */
export const DEFAULT_AUTHORIZATION_HOSTS: readonly string[] = ["checkout.paystack.com"];

/**
 * Defense in depth before the browser is sent to a payment page: https only, exact allowed host, no embedded
 * credentials, no custom port. Lookalike hosts and the user@host trick are rejected.
 */
export function isSafeAuthorizationUrl(url: string, allowedHosts: readonly string[] = DEFAULT_AUTHORIZATION_HOSTS): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.protocol === "https:" &&
    parsed.username === "" &&
    parsed.password === "" &&
    parsed.port === "" &&
    allowedHosts.includes(parsed.hostname)
  );
}
