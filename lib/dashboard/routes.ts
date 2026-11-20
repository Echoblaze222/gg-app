/**
 * Screens that exist today. A notification deep link becomes a link only when it points at one of these, so no link in the app
 * leads to a missing screen. Add a route here in the same change that adds its page.
 */
const BUILT_EXACT = new Set(["/app", "/app/pay", "/app/history", "/app/notifications"]);
const BUILT_PREFIXES = ["/app/history/"];

export function isBuiltRoute(link: string | null | undefined): link is string {
  if (!link) return false;
  // Deep links are validated by AI-5 to stay inside /app. This only decides whether the target page exists yet.
  return BUILT_EXACT.has(link) || BUILT_PREFIXES.some((p) => link.startsWith(p) && link.length > p.length);
}
