/**
 * Screen reader announcement for a state change. Every animation and every stateful control renders one,
 * so animation is never the only signal (RESEARCH.md 4.6 rule 8).
 * Empty text renders an empty region, so nothing is announced on first render.
 */
export function LiveRegion({ message }: { message: string }) {
  return (
    <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </span>
  );
}
