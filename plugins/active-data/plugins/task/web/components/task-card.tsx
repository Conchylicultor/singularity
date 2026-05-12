import { useId, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { PromptEditor } from "@plugins/primitives/plugins/paste-images/web";
import { LaunchButtons } from "@plugins/primitives/plugins/launch/web";
import { taskSidePane } from "@plugins/conversations/plugins/conversation-view/plugins/side-task/web";
import { useActiveDataBinding } from "@plugins/active-data/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { usePaneMatch, useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { ConversationItem } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import {
  attemptsResource,
  tasksResource,
  type Attempt,
} from "@plugins/tasks/core";
import { taskConversationPane } from "@plugins/tasks/plugins/task-detail/web";
import { TaskSchema, type Task } from "@plugins/tasks-core/core";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ATTEMPT_STATUS_CLASSES: Record<Attempt["status"], string> = {
  pending: "bg-muted text-muted-foreground",
  in_progress: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  pushed: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  abandoned: "bg-muted text-muted-foreground italic",
};

const ATTEMPT_STATUS_LABELS: Record<Attempt["status"], string> = {
  pending: "Pending",
  in_progress: "In progress",
  pushed: "Pushed",
  completed: "Completed",
  abandoned: "Abandoned",
};

const TaskBindingSchema = z.object({
  taskId: z.string(),
  launchedConvId: z.string().optional(),
});
type TaskBinding = z.infer<typeof TaskBindingSchema>;

export function TaskCard({
  content,
}: {
  attrs: Record<string, string>;
  content: string;
}) {
  const initial = content.trim();
  const editorNs = useId();
  const { conversation } = conversationPane.useData();
  const hostTaskId = conversation.taskId;

  const binding = useActiveDataBinding<TaskBinding>(TaskBindingSchema);

  const [prompt, setPrompt] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Captured in a ref (not state) because onLaunched closes over the render
  // it was created in — a state setter from getRequest wouldn't be visible
  // to the in-flight callback. The ref always reads the latest value.
  const pendingTaskIdRef = useRef<string | null>(null);

  if (!initial) return null;

  // Wait for the binding to load before rendering anything destructive — the
  // editable card collapses to a chip once we know the persisted state, so
  // showing the card during load would briefly invite a duplicate Create.
  if (binding.enabled && binding.isLoading) return null;

  if (binding.value?.launchedConvId && binding.value.taskId) {
    return (
      <div className="my-2 flex flex-col gap-1.5">
        <p className="text-muted-foreground text-sm">{initial}</p>
        <LaunchedAttempts taskId={binding.value.taskId} />
      </div>
    );
  }

  if (binding.value?.taskId) {
    return <TaskChip taskId={binding.value.taskId} />;
  }

  const trimmed = prompt.trim();
  const disabled = creating || !trimmed;

  const createTask = async (): Promise<Task> => {
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId: hostTaskId, description: trimmed }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `Create task failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
      );
    }
    return TaskSchema.parse(await res.json());
  };

  const onCreate = async () => {
    if (creating || !trimmed) return;
    setCreating(true);
    setError(null);
    try {
      const task = await createTask();
      await binding.set({ taskId: task.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="border-border bg-background my-2 flex flex-col gap-2 rounded-md border p-2">
      <PromptEditor
        value={prompt}
        onChange={setPrompt}
        placeholder="What should be done?"
        disabled={creating}
        minRows={3}
        maxHeight="20rem"
        namespace={`active-data-task-${editorNs}`}
      />
      <div className="flex items-center justify-end gap-2">
        {error ? (
          <span className="text-destructive mr-auto truncate text-xs" title={error}>
            {error}
          </span>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          onClick={onCreate}
          disabled={disabled}
          title="Create task"
        >
          {creating ? "Creating…" : "Create"}
        </Button>
        <LaunchButtons
          size="icon"
          disabled={disabled}
          openAfterLaunch={false}
          getRequest={async () => {
            const task = await createTask();
            pendingTaskIdRef.current = task.id;
            await binding.set({ taskId: task.id });
            return { taskId: task.id, prompt: trimmed };
          }}
          onLaunched={async (conv) => {
            const taskId = pendingTaskIdRef.current;
            if (taskId) {
              await binding.set({ taskId, launchedConvId: conv.id });
            }
          }}
        />
      </div>
    </div>
  );
}

function LaunchedAttempts({ taskId }: { taskId: string }) {
  const attemptsQ = useResource(attemptsResource);
  const match = usePaneMatch();
  const openPane = useOpenPane();
  const activeConvId = match?.chain.find(
    (e) => e.pane === taskConversationPane._internal,
  )?.params.convId;

  const attempts = useMemo(() => {
    const rows = attemptsQ.data;
    return rows
      .filter((a) => a.taskId === taskId)
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [attemptsQ.data, taskId]);

  if (attempts.length === 0) {
    return (
      <span className="text-muted-foreground block text-xs">
        Launching…
      </span>
    );
  }

  return (
    <div className="border-border flex flex-col gap-2 rounded-md border px-3 py-2">
      {attempts.map((attempt) => (
        <div key={attempt.id} className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-xs font-medium",
                ATTEMPT_STATUS_CLASSES[attempt.status],
              )}
            >
              {ATTEMPT_STATUS_LABELS[attempt.status]}
            </span>
            <span className="text-muted-foreground truncate font-mono text-xs">
              {attempt.worktreePath.split("/").pop()}
            </span>
          </div>
          {attempt.conversations.length > 0 && (
            <ul className="flex flex-col gap-0.5">
              {attempt.conversations.map((c) => {
                const isActive = activeConvId === c.id;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (activeConvId === c.id) {
                          taskConversationPane.close();
                        } else {
                          openPane(taskConversationPane, { taskId, convId: c.id });
                        }
                      }}
                      className={cn(
                        "hover:bg-accent flex w-full items-start rounded px-2 py-1 text-left",
                        isActive && "bg-accent",
                      )}
                    >
                      <ConversationItem conv={c} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function TaskChip({ taskId }: { taskId: string }) {
  const { conversation } = conversationPane.useData();
  const { data: tasks } = useResource(tasksResource);
  const openPane = useOpenPane();
  const task = tasks.find((t) => t.id === taskId);
  const title = task?.title.trim() || "Untitled task";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openPane(taskSidePane, { convId: conversation.id, taskId });
      }}
      className="bg-muted text-primary hover:bg-muted/80 inline-flex max-w-full items-center gap-1.5 rounded px-1.5 py-0.5 align-baseline text-xs hover:underline"
      title={title}
    >
      <span className="text-muted-foreground">✓</span>
      <span className="truncate">{title}</span>
    </button>
  );
}
