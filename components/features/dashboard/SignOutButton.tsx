"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { signOutAction } from "@/lib/dashboard/actions";
import { Icon } from "./icons";

export function SignOutButton() {
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);
  return (
    <Button
      variant="quiet"
      status={pending ? "loading" : failure ? "failure" : "idle"}
      loadingLabel="Signing out"
      failureLabel={failure ?? "Could not sign out. Try again."}
      leadingIcon={<Icon name="logout" className="size-4" />}
      onClick={() => {
        setFailure(null);
        startTransition(async () => {
          // On success the server action redirects, so this only returns when sign out failed.
          const result = await signOutAction();
          setFailure(`Could not sign out. ${result.error.action}`);
        });
      }}
    >
      Sign out
    </Button>
  );
}
