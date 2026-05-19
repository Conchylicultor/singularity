import { useEffect, useRef } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { toast } from "@plugins/notifications/web";
import { forkErrorsResource } from "@plugins/conversations/core";

export function ForkErrorWatcher() {
  const result = useResource(forkErrorsResource);
  const lastSeen = useRef<string | null>(null);

  useEffect(() => {
    const data = result.pending ? undefined : result.data;
    if (!data) {
      // Remember the baseline so we don't re-toast a pre-existing error
      // after a fresh subscription.
      lastSeen.current = null;
      return;
    }
    if (lastSeen.current === null) {
      // First observation — treat current value as baseline, not a new event.
      lastSeen.current = data.id;
      return;
    }
    if (lastSeen.current === data.id) return;
    lastSeen.current = data.id;
    toast({
      type: "db",
      title: "DB fork failed",
      description: `${data.attemptId}: ${data.message}`,
      variant: "error",
    });
  }, [result]);

  return null;
}
