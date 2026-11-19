"use client";

import { Button, ErrorState } from "@/components/ui";

/** Last resort boundary for the member area. Data failures are handled per card, so this means the screen itself failed to render. */
export default function MemberError({ error, reset }: { error: unknown; reset: () => void }) {
  const reference = (error as { digest?: string } | null)?.digest;
  return (
    <ErrorState
      title="This screen could not load"
      action={
        <Button variant="secondary" onClick={() => reset()}>
          Try again
        </Button>
      }
    >
      Something failed on our side while building this screen. No payment was started from here. If you were paying, check your history before trying again. If it keeps failing, quote the reference when you contact support.
      {reference ? ` Reference ${reference}.` : ""}
    </ErrorState>
  );
}
