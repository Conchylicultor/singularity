import { useEffect, useRef } from "react";
import { conversationsResource } from "@plugins/conversations/core";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { toast } from "@plugins/notifications/web";
import { tasksResource } from "@plugins/tasks/core";
import { MODEL_REGISTRY, normalizeModel } from "@plugins/conversations/plugins/model-provider/core";

const CAUSALITY_VALUES = new Set(["user-launch", "dep-resolved", "mcp-add-task"]);

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
      if (
        !seenIdsRef.current.has(conv.id as string) &&
        CAUSALITY_VALUES.has(conv.spawnedBy as string)
      ) {
        const model = MODEL_REGISTRY[normalizeModel(conv.model)].label;
        const tasks = tasksResult.pending ? [] : tasksResult.data;
        const task = tasks.find((t) => t.id === conv.taskId);
        const taskTitle = task?.title ?? "";
        const description =
          conv.spawnedBy === "dep-resolved" && taskTitle
            ? `${taskTitle} unblocked · ${model}`
            : taskTitle
              ? `${taskTitle} started · ${model}`
              : `Started · ${model}`;
        toast({ type: "task", description, variant: "info", linkTo: `/c/${conv.id}` });
      }
      seenIdsRef.current.add(conv.id as string);
    }
  }, [result, tasksResult]);

  return null;
}
