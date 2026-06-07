import { useId, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { TextEditor } from "@plugins/primitives/plugins/text-editor/web";
import { LaunchControl } from "@plugins/primitives/plugins/launch/web";
import { taskSidePane } from "@plugins/conversations/plugins/conversation-view/plugins/side-task/web";
import { useActiveDataBinding } from "@plugins/active-data/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { ConversationItem } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import {
  attemptsResource,
  tasksResource,
} from "@plugins/tasks/core";
import { TaskSchema, type Task } from "@plugins/tasks-core/core";
import { AttemptStatusBadge } from "@plugins/tasks/plugins/attempt-status/web";
import { Button } from "@/components/ui/button";
import { Row } from "@plugins/primitives/plugins/row/web";
import { LinkChip } from "@plugins/primitives/plugins/link-chip/web";

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
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  const hostTaskId = conversation?.taskId ?? null;

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
  if (binding.enabled && binding.pending) return null;
  const value = binding.pending ? null : binding.value;

  if (value?.launchedConvId && value.taskId) {
    return (
      <div className="my-2 flex flex-col gap-1.5">
        <p className="text-muted-foreground text-sm">{initial}</p>
        <LaunchedAttempts taskId={value.taskId} />
      </div>
    );
  }

  if (value?.taskId) {
    return <TaskChip taskId={value.taskId} />;
  }

  const trimmed = prompt.trim();
  const disabled = creating || !trimmed;

  const createTask = async (): Promise<Task> => {
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: hostTaskId, description: trimmed }),
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
      <TextEditor
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
        <LaunchControl
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
  const openPane = useOpenPane();
  // Find the last conversationPane in the chain — if there are multiple
  // (host + nested), the last one is the one the user opened from here.
  const convEntries = conversationPane.useChainEntries();
  const activeConvEntry = convEntries.length > 1
    ? convEntries[convEntries.length - 1]!
    : null;
  const activeConvId = activeConvEntry?.params.convId;

  const attempts = useMemo(() => {
    if (attemptsQ.pending) return [];
    return attemptsQ.data
      .filter((a) => a.taskId === taskId)
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [attemptsQ, taskId]);

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
            <AttemptStatusBadge status={attempt.status} />
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
                    <Row
                      selected={isActive}
                      onClick={() => {
                        if (activeConvId === c.id && activeConvEntry) {
                          conversationPane.close(activeConvEntry.instanceId);
                        } else {
                          openPane(conversationPane, { convId: c.id }, { mode: "push" });
                        }
                      }}
                    >
                      <ConversationItem conv={c} />
                    </Row>
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
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  const tasksResult = useResource(tasksResource);
  const openPane = useOpenPane();
  const task = tasksResult.pending ? undefined : tasksResult.data.find((t) => t.id === taskId);
  const title = task?.title.trim() || "Untitled task";
  if (!conversation) return null;
  return (
    <LinkChip
      onClick={(e) => {
        e.stopPropagation();
        openPane(taskSidePane, { taskId }, { mode: "push", input: { convId: conversation.id } });
      }}
      leading={<span className="text-muted-foreground">✓</span>}
      title={title}
    >
      {title}
    </LinkChip>
  );
}
