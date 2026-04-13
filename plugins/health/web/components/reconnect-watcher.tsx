import { useEffect } from "react";
import { subscribeWsStatus } from "@core";
import { Shell } from "@plugins/shell/web/commands";

export function ReconnectWatcher() {
  useEffect(() => {
    const wasReconnecting = new Set<string>();
    let toastTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleToast = () => {
      if (toastTimer) return;
      toastTimer = setTimeout(() => {
        toastTimer = null;
        Shell.Toast({ description: "Reconnected to server", variant: "info" });
      }, 150);
    };

    const unsub = subscribeWsStatus(({ url, status }) => {
      if (status === "reconnecting") {
        wasReconnecting.add(url);
      } else if (status === "open" && wasReconnecting.has(url)) {
        wasReconnecting.delete(url);
        scheduleToast();
      } else if (status === "closed") {
        wasReconnecting.delete(url);
      }
    });

    return () => {
      unsub();
      if (toastTimer) clearTimeout(toastTimer);
    };
  }, []);

  return null;
}
