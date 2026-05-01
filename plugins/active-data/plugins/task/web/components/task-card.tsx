import { useId, useState } from "react";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { PromptEditor } from "@plugins/primitives/plugins/paste-images/web";
import { LaunchButtons } from "@plugins/primitives/plugins/launch/web";
import { ConvChip } from "@plugins/active-data/plugins/conv/web";
import { taskSidePane } from "@plugins/conversations/plugins/conversation-view/plugins/side-task/web";
import { TaskSchema, type Task } from "@plugins/tasks-core/shared";
import { Button } from "@/components/ui/button";

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

  const [prompt, setPrompt] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [createdTask, setCreatedTask] = useState<Task | null>(null);
  const [launchedConvId, setLaunchedConvId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!initial) return null;

  if (launchedConvId) {
    return <ConvChip content={launchedConvId} attrs={{}} />;
  }

  if (createdTask) {
    return <TaskChip task={createdTask} />;
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
      setCreatedTask(task);
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
            setCreatedTask(task);
            return { taskId: task.id, prompt: trimmed };
          }}
          onLaunched={(conv) => setLaunchedConvId(conv.id)}
        />
      </div>
    </div>
  );
}

function TaskChip({ task }: { task: Task }) {
  const { conversation } = conversationPane.useData();
  const title = task.title?.trim() || "Untitled task";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        taskSidePane.open({ convId: conversation.id, taskId: task.id });
      }}
      className="bg-muted text-primary hover:bg-muted/80 inline-flex max-w-full items-center gap-1.5 rounded px-1.5 py-0.5 align-baseline text-xs hover:underline"
      title={title}
    >
      <span className="text-muted-foreground">✓</span>
      <span className="truncate">{title}</span>
    </button>
  );
}
