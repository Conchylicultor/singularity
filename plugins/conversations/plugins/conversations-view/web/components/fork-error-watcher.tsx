import { useEffect, useRef } from "react";
import { useResource } from "@core";
import { Shell } from "@plugins/shell/web/commands";
import { forkErrorsResource } from "@plugins/conversations/shared/fork-errors";

export function ForkErrorWatcher() {
  const { data } = useResource(forkErrorsResource);
  const lastSeen = useRef<string | null>(null);

  useEffect(() => {
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
    Shell.Toast({
      title: "DB fork failed",
      description: `${data.attemptId}: ${data.message}`,
      variant: "error",
    });
  }, [data]);

  return null;
}
