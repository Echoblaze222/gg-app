"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { Icon } from "./icons";

/** Reloads the server data for the current screen. Only offered for reads, which are always safe to repeat. */
export function RetryButton({ label = "Try again" }: { label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  return (
    <Button
      variant="secondary"
      status={pending ? "loading" : failed ? "failure" : "idle"}
      loadingLabel="Reloading"
      failureLabel="Still not loading. Try again."
      leadingIcon={<Icon name="refresh" className="size-4" />}
      onClick={() => {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          setFailed(true);
          return;
        }
        setFailed(false);
        startTransition(() => router.refresh());
      }}
    >
      {label}
    </Button>
  );
}
