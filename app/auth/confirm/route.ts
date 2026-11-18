import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { authLogger } from "@/lib/auth/composition";
import { confirmEmailToken } from "@/lib/auth/flows";
import { createRequestAuthFull, fromNextCookies } from "@/lib/auth/supabase-clients";

/**
 * Target of the link in the sign up confirmation email:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
 * Confirms the address, then sends the browser to the login page. The destination is fixed, never taken from the
 * request, so this cannot be used as an open redirect.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  let confirmed = false;
  try {
    const auth = createRequestAuthFull(fromNextCookies(await cookies(), { writable: true }));
    confirmed = await confirmEmailToken(auth, { tokenHash: params.get("token_hash") ?? "", type: params.get("type") ?? "" });
  } catch (err) {
    authLogger.error("email_confirm_failed", err instanceof Error ? err.name : "unknown");
  }
  const destination = new URL("/login", request.nextUrl.origin);
  destination.searchParams.set("verified", confirmed ? "1" : "failed");
  const response = NextResponse.redirect(destination, 303);
  // The link carries a one time token. Do not let it travel in a Referer header.
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Cache-Control", "no-store");
  return response;
}
