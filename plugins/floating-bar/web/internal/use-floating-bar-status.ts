import { useEffect, useRef, useState } from "react";
import {
  useNotificationsChannelStatuses,
  useResource,
} from "@plugins/primitives/plugins/live-state/web";
import { frontendHashResource } from "@plugins/build/core";
import { notificationsResource } from "@plugins/notifications/web";

export type StatusTone = "ok" | "warning" | "destructive";

export interface FloatingBarStatus {
  tone: StatusTone;
  pulse: boolean;
  tooltip: string;
}

/**
 * Aggregates the existing "needs attention" signals into a single tone +
 * tooltip for the floating bar's collapsed status dot:
 *  - server/central WS disconnected → destructive
 *  - reconnecting/connecting        → warning (pulsing)
 *  - frontend rebuilt since load    → warning (stale tab)
 *  - unread error/warning notifs    → warning
 */
export function useFloatingBarStatus(): FloatingBarStatus {
  const { worktree, central } = useNotificationsChannelStatuses();

  // Stale-tab detection — frontend rebuilt since this tab loaded.
  // (Same initial-hash-ref pattern as build/web/components/build-button.tsx.)
  const hashResult = useResource(frontendHashResource);
  const currentHash = hashResult.pending ? "" : hashResult.data.hash;
  const initialHashRef = useRef<string | null>(null);
  const [staleTab, setStaleTab] = useState(false);
  useEffect(() => {
    if (hashResult.pending || !currentHash) return;
    if (initialHashRef.current === null) initialHashRef.current = currentHash;
    else if (currentHash !== initialHashRef.current) setStaleTab(true);
  }, [hashResult.pending, currentHash]);

  // Unread error/warning notifications (same filter as the bell button).
  const notifResult = useResource(notificationsResource);
  const notifs = notifResult.pending ? [] : notifResult.data;
  const attentionCount = notifs.filter(
    (n) => !n.read && (n.variant === "error" || n.variant === "warning"),
  ).length;

  const disconnected = worktree === "closed" || central === "closed";
  const reconnecting =
    worktree === "reconnecting" ||
    central === "reconnecting" ||
    worktree === "connecting" ||
    central === "connecting";

  const reasons: string[] = [];
  let tone: StatusTone = "ok";
  let pulse = false;

  if (disconnected) {
    tone = "destructive";
    reasons.push("Server disconnected");
  } else if (reconnecting) {
    tone = "warning";
    pulse = true;
    reasons.push("Reconnecting…");
  }

  if (staleTab) {
    if (tone === "ok") tone = "warning";
    reasons.push("Tab is stale — server was rebuilt");
  }
  if (attentionCount > 0) {
    if (tone === "ok") tone = "warning";
    reasons.push(
      `${attentionCount} notification${attentionCount !== 1 ? "s" : ""} need attention`,
    );
  }

  return {
    tone,
    pulse,
    tooltip: reasons.length > 0 ? reasons.join(" · ") : "All systems normal",
  };
}
