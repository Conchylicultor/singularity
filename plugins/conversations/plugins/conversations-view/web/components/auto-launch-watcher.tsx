import { useEffect, useRef } from "react";
import { useConversations } from "@plugins/conversations/web";
import { ShellCommands as Shell } from "@plugins/shell/web";

export function AutoLaunchWatcher() {
  const { active, isLoading } = useConversations();
  const initializedRef = useRef(false);
  const seenIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (isLoading) return;
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
  }, [active, isLoading]);

  return null;
}
