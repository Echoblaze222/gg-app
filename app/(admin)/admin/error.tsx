"use client";

import { Button, ErrorState } from "@/components/ui";

/**
 * Last resort when the page itself throws while rendering. The digest is the id Next.js also writes to the server
 * log, so it works as the reference. The page only reads numbers, so a retry is safe.
 */
export default function AdminDashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6">
      <ErrorState title="The dashboard could not load" action={<Button onClick={reset}>Try again</Button>}>
        Something failed on our side. No money moved: this page only reads numbers.{error.digest ? ` Reference: ${error.digest}.` : ""}
      </ErrorState>
    </div>
  );
}
