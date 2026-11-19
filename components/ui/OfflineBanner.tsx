"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Icon } from "./icons";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** Tells the person when the device loses connection and when it returns. Data on screen may be out of date while offline. */
export function OfflineBanner() {
  // Server and first client render assume online, so there is no hydration mismatch.
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  const [wasOffline, setWasOffline] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Remember that we went offline, so the "back online" note can show once and fade after a few seconds.
  useEffect(() => {
    if (!online) {
      const t = setTimeout(() => {
        setWasOffline(true);
        setDismissed(false);
      }, 0);
      return () => clearTimeout(t);
    }
    if (wasOffline) {
      const t = setTimeout(() => setDismissed(true), 4000);
      return () => clearTimeout(t);
    }
  }, [online, wasOffline]);

  const showBack = online && wasOffline && !dismissed;
  if (online && !showBack) return <div role="status" aria-live="polite" className="sr-only" />;
  return (
    <div role="status" aria-live="polite" className="offline" data-state={online ? "back" : "offline"}>
      <Icon name={online ? "refresh" : "wifi-off"} className="offline__icon" />
      <span>{online ? "Back online. Refresh to see the latest." : "You are offline. What you see may be out of date. Payments cannot start until you reconnect."}</span>
    </div>
  );
}
