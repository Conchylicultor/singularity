import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { jsonlEventsResource } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/core";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";

export interface TaskEntry {
  taskId: string;
  description: string;
  status: string;
}

export interface TaskAggregate {
  tasks: TaskEntry[];
  completedCount: number;
  totalCount: number;
  shouldShow: boolean;
}

const TERMINAL_STATUSES = new Set(["completed", "failed", "stopped"]);

type ToolCallEvent = Extract<JsonlEvent, { kind: "tool-call" }>;

function parseResultContent(event: ToolCallEvent): Record<string, unknown> | null {
  if (!event.result?.content || event.result.isError) return null;
  try {
    return JSON.parse(event.result.content);
  } catch {
    return null;
  }
}

function buildAggregate(events: JsonlEvent[]): TaskAggregate {
  const taskMap = new Map<string, TaskEntry>();
  const ordered: string[] = [];

  for (const ev of events) {
    if (ev.kind !== "tool-call") continue;
    const toolEvent = ev as ToolCallEvent;

    if (toolEvent.name === "TaskCreate" && toolEvent.result) {
      const result = parseResultContent(toolEvent);
      const input = toolEvent.input as { subject?: string; description?: string } | undefined;
      const taskId = (result?.id as string) ?? (result?.task_id as string) ?? (result?.taskId as string);
      if (!taskId) continue;
      if (!taskMap.has(taskId)) {
        ordered.push(taskId);
      }
      taskMap.set(taskId, {
        taskId,
        description: input?.subject ?? input?.description ?? "Task",
        status: "pending",
      });
    } else if (toolEvent.name === "TaskUpdate" && toolEvent.result && !toolEvent.result.isError) {
      const input = toolEvent.input as { taskId?: string; id?: string; status?: string; description?: string } | undefined;
      const taskId = input?.taskId ?? input?.id;
      if (!taskId) continue;
      const existing = taskMap.get(taskId);
      if (existing) {
        if (input?.status) existing.status = input.status;
        if (input?.description) existing.description = input.description;
      }
    } else if (toolEvent.name === "TaskStop" && toolEvent.result) {
      const input = toolEvent.input as { taskId?: string; id?: string } | undefined;
      const taskId = input?.taskId ?? input?.id;
      if (!taskId) continue;
      const existing = taskMap.get(taskId);
      if (existing) existing.status = "stopped";
    }
  }

  const tasks = ordered.map((id) => taskMap.get(id)!).filter(Boolean);
  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const allTerminal = tasks.length > 0 && tasks.every((t) => TERMINAL_STATUSES.has(t.status));

  return {
    tasks,
    completedCount,
    totalCount: tasks.length,
    shouldShow: tasks.length > 0 && !allTerminal,
  };
}

export function useTaskAggregate(): TaskAggregate {
  const { convId } = conversationPane.useParams();
  const result = useResource(jsonlEventsResource, { id: convId });

  return useMemo(
    () => (result.pending ? { tasks: [], completedCount: 0, totalCount: 0, shouldShow: false } : buildAggregate(result.data)),
    [result],
  );
}
