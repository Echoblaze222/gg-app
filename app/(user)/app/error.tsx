"use client";

import { Button, ErrorState } from "@/components/ui";

/** Last resort boundary for the member area. Data failures are handled per card, so this means the screen itself failed to render. */
export default function MemberError({ error, retry }: { error: unknown; retry: () => void }) {
  const reference = (error as { digest?: string } | null)?.digest;
  return (
    <ErrorState
      title="This screen could not load"
      message="Something failed on our side while building this screen."
      moneyLine="No payment was started from here. If you were paying, check your history before trying again."
      action="Try again. If it keeps failing, quote the reference when you contact support."
      reference={reference}
      retry={<Button variant="secondary" onClick={() => retry()}>Try again</Button>}
    />
  );
}
