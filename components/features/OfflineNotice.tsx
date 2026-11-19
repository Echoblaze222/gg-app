"use client";

import { useSyncExternalStore } from "react";
import { Alert } from "@/components/ui";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

/** The server cannot know, so it renders as online and the notice appears after hydration if the device is offline. */
function getServerSnapshot(): boolean {
  return true;
}

/**
 * The offline state for any screen. Appears the moment the device loses its connection and goes away when it returns.
 * It says what is true: the numbers on screen are the last ones loaded.
 */
export function OfflineNotice() {
  const online = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (online) {
    return null;
  }
  return (
    <Alert tone="warning" title="You are offline">
      What you see is the last data that loaded. Nothing you do now reaches the server. It updates when you are back online.
    </Alert>
  );
}
