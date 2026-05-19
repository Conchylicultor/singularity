import { useEffect, useRef } from "react";
import { conversationsResource } from "@plugins/conversations/core";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { toast } from "@plugins/notifications/web";
import { tasksResource } from "@plugins/tasks/core";

export function AutoLaunchWatcher() {
  const result = useResource(conversationsResource);
  const tasksResult = useResource(tasksResource);
  const initializedRef = useRef(false);
  const seenIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (result.pending) return;
    const active = result.data.active;
    if (!initializedRef.current) {
      initializedRef.current = true;
      for (const conv of active) seenIdsRef.current.add(conv.id as string);
      return;
    }
    for (const conv of active) {
      if (!seenIdsRef.current.has(conv.id as string) && conv.spawnedBy === "auto-start") {
        const model = conv.model === "opus" ? "Opus" : "Sonnet";
        const tasks = tasksResult.pending ? [] : tasksResult.data;
        const task = tasks.find((t) => t.id === conv.taskId);
        const taskLabel = task?.title ? ` · ${task.title}` : "";
        toast({ type: "task", description: `Auto-started queued task${taskLabel} · ${model}`, variant: "info" });
      }
      seenIdsRef.current.add(conv.id as string);
    }
  }, [result, tasksResult]);

  return null;
}
