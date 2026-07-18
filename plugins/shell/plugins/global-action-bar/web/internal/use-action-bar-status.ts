import { useEffect, useRef, useState } from "react";
import {
  useNotificationsChannelStatuses,
  useResource,
  useWindowResource,
} from "@plugins/primitives/plugins/live-state/web";
import { frontendHashResource } from "@plugins/build/core";
import { notificationsResource } from "@plugins/shell/plugins/notifications/web";

export type StatusTone = "ok" | "warning" | "destructive";

export interface ActionBarStatus {
  /** True while notifications are still loading — consumer should show a neutral dot. */
  pending: boolean;
  tone: StatusTone;
  pulse: boolean;
  tooltip: string;
}

/**
 * Aggregates the existing "needs attention" signals into a single tone +
 * tooltip for the action bar's collapsed status dot:
 *  - server/central WS disconnected → destructive
 *  - reconnecting/connecting        → warning (pulsing)
 *  - frontend rebuilt since load    → warning (stale tab)
 *  - unread error/warning notifs    → warning
 */
export function useActionBarStatus(): ActionBarStatus {
  const { worktree, central } = useNotificationsChannelStatuses();

  // Stale-tab detection — frontend rebuilt since this tab loaded.
  // (Same initial-hash-ref pattern as build/web/components/build-button.tsx.)
  const hashResult = useResource(frontendHashResource);
  const initialHashRef = useRef<string | null>(null);
  const [staleTab, setStaleTab] = useState(false);
  // Read the hash inside the effect, narrowing via pending so TypeScript can see
  // that data is defined. The empty-string default is genuinely correct here:
  // when pending the effect returns early and never uses the hash for a staleTab decision.
  useEffect(() => {
    if (hashResult.pending) return;
    const currentHash = hashResult.data.hash;
    if (!currentHash) return;
    if (initialHashRef.current === null) initialHashRef.current = currentHash;
    else if (currentHash !== initialHashRef.current) setStaleTab(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- hashResult identity changes on each push; depend on the result object
  }, [hashResult]);

  // Unread error/warning notifications (same filter as the bell button).
  // No hook calls after this point, so we can gate with an early return
  // to prevent attentionCount=0 from producing a false "all ok" tone.
  const notifResult = useWindowResource(notificationsResource);

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

  // While notifications are loading, return with pending=true — the consumer
  // renders a neutral dot so the badge never flashes 0→N.
  if (notifResult.pending) {
    return {
      pending: true,
      tone,
      pulse,
      tooltip: reasons.length > 0 ? reasons.join(" · ") : "Loading…",
    };
  }

  const attentionCount = notifResult.data.filter(
    (n) => !n.read && (n.variant === "error" || n.variant === "warning"),
  ).length;

  if (attentionCount > 0) {
    if (tone === "ok") tone = "warning";
    reasons.push(
      `${attentionCount} notification${attentionCount !== 1 ? "s" : ""} need attention`,
    );
  }

  return {
    pending: false,
    tone,
    pulse,
    tooltip: reasons.length > 0 ? reasons.join(" · ") : "All systems normal",
  };
}
