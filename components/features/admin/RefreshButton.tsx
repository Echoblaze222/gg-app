"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui";

/**
 * Reloads the server rendered numbers in place. Only for read only pages, where repeating the request is always safe.
 * Shows a loading state while the page refreshes so a second tap cannot pile up requests.
 */
export function RefreshButton({ variant = "secondary", children = "Try again" }: { variant?: "primary" | "secondary"; children?: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant={variant}
      status={pending ? "loading" : "idle"}
      loadingLabel="Reloading"
      onClick={() => {
        startTransition(() => {
          router.refresh();
        });
      }}
    >
      {children}
    </Button>
  );
}
