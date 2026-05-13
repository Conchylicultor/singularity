import { useEffect, useRef } from "react";
import { recentConversationsResource } from "@plugins/conversations/core";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { ShellCommands as Shell } from "@plugins/shell/web";

export function AutoLaunchWatcher() {
  const { data, dataUpdatedAt } = useResource(recentConversationsResource);
  const initializedRef = useRef(false);
  const seenIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (dataUpdatedAt === 0) return;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- data may be undefined before resource hydrates
    const active = data?.active ?? [];
    if (!initializedRef.current) {
      initializedRef.current = true;
      for (const conv of active) seenIdsRef.current.add(conv.id as string);
      return;
    }
    for (const conv of active) {
      if (!seenIdsRef.current.has(conv.id as string) && conv.spawnedBy === "auto-start") {
        const model = conv.model === "opus" ? "Opus" : "Sonnet";
        Shell.Toast({ description: `Auto-started queued task · ${model}`, variant: "info" });
      }
      seenIdsRef.current.add(conv.id as string);
    }
  }, [data, dataUpdatedAt]);

  return null;
}
