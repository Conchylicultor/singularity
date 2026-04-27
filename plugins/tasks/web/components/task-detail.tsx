import { useCallback, useMemo } from "react";
import { LaunchButtons } from "@plugins/launch/web";
import { Button } from "@/components/ui/button";
import { TaskAttachments } from "./task-attachments";
import { TaskDependencies } from "./task-dependencies";
import { TaskEvents } from "./task-events";
import { DescriptionView } from "./description-view";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useEditableField } from "@plugins/primitives/plugins/editable-field/web";
import { useConversationById } from "@plugins/conversations/web";
import { tasksResource, type Task } from "../../shared/resources";
import { taskDetailPane } from "../panes";

const STATUS_LABELS: Record<Task["status"], string> = {
  new: "New",
  in_progress: "In progress",
  need_action: "Need action",
  attempted: "Attempted",
  done: "Done",
  held: "Held",
  dropped: "Dropped",
  blocked: "Blocked",
};

const STATUS_CLASSES: Record<Task["status"], string> = {
  new: "bg-muted",
  in_progress: "bg-muted",
  need_action: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  attempted: "bg-muted",
  done: "bg-muted",
  held: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  dropped: "bg-muted text-muted-foreground/60 italic",
  blocked: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
};

function AuthorDisplay({ author }: { author: string | null }) {
  const isUser = !author || author === "user";
  const { data: tasksData } = useResource(tasksResource);
  const authorConversation = useConversationById(isUser ? null : author);

  const authorTask = useMemo(() => {
    if (!authorConversation) return null;
    return tasksData?.find((t) => t.id === authorConversation.taskId) ?? null;
  }, [authorConversation, tasksData]);

  if (isUser) {
    return <span className="text-sm">User</span>;
  }

  if (!authorTask) {
    return <span className="text-muted-foreground font-mono text-xs">{author}</span>;
  }

  return (
    <button
      type="button"
      onClick={() => taskDetailPane.open({ taskId: authorTask.id })}
      className="hover:text-foreground text-sm underline underline-offset-2"
    >
      {authorTask.title}
    </button>
  );
}

export function TaskDetail({
  taskId,
  onFileOpen,
}: {
  taskId: string;
  onFileOpen?: (path: string) => void;
}) {
  const { data } = useResource(tasksResource);
  const task = data?.find((t) => t.id === taskId) ?? null;

  const save = useCallback(
    async (
      patch: Partial<{
        title: string;
        description: string | null;
        drop: boolean;
        hold: boolean;
      }>,
    ) => {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        await res.json();
      }
    },
    [taskId],
  );

  const titleField = useEditableField({
    value: task?.title ?? "",
    onSave: (v) => save({ title: v.trim() || "Untitled" }),
  });
  const descField = useEditableField({
    value: task?.description ?? "",
    onSave: (v) => save({ description: v }),
  });

  const toggleDrop = () => {
    if (!task) return;
    void save({ drop: task.status !== "dropped" });
  };

  const toggleHold = () => {
    if (!task) return;
    void save({ hold: task.status !== "held" });
  };

  const buildLaunchRequest = useCallback(async () => {
    await Promise.all([titleField.flush(), descField.flush()]);
    const trimmedTitle = titleField.value.trim() || "Untitled";
    const desc = descField.value;
    const prompt = desc.trim() ? `${trimmedTitle}\n\n${desc}` : trimmedTitle;
    return { taskId, prompt };
  }, [taskId, titleField, descField]);

  const saving = titleField.isSaving || descField.isSaving;

  if (!task) {
    return <div className="text-muted-foreground p-6 text-sm">Loading…</div>;
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-start gap-3">
        <input
          value={titleField.value}
          onChange={(e) => titleField.onChange(e.target.value)}
          onFocus={titleField.onFocus}
          onBlur={titleField.onBlur}
          placeholder="Untitled"
          className="flex-1 bg-transparent text-xl font-semibold outline-none placeholder:text-muted-foreground focus:ring-0"
        />
        <span className="text-muted-foreground pt-1 text-xs">
          {saving ? "Saving…" : "Saved"}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground text-xs uppercase tracking-wide">
          Status
        </span>
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[task.status]}`}
        >
          {STATUS_LABELS[task.status]}
        </span>
        <Button
          size="sm"
          variant={task.status === "held" ? "secondary" : "outline"}
          onClick={toggleHold}
        >
          {task.status === "held" ? "Resume" : "Hold"}
        </Button>
        <Button
          size="sm"
          variant={task.status === "dropped" ? "secondary" : "outline"}
          onClick={toggleDrop}
        >
          {task.status === "dropped" ? "Undrop" : "Drop task"}
        </Button>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground text-xs uppercase tracking-wide">
          Author
        </span>
        <AuthorDisplay author={task.author ?? "user"} />
      </div>
      <DescriptionView
        value={descField.value}
        onChange={descField.onChange}
        onFocus={descField.onFocus}
        onBlur={descField.onBlur}
        onFileOpen={onFileOpen}
      />
      <div className="flex justify-end">
        <LaunchButtons
          size="sm"
          getRequest={buildLaunchRequest}
          disabled={!titleField.value.trim()}
          className="w-auto"
          openAfterLaunch={false}
        />
      </div>
      <TaskAttachments taskId={taskId} />
      <TaskDependencies taskId={taskId} />
      <TaskEvents taskId={taskId} />
    </div>
  );
}
