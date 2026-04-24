import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LaunchButtons } from "@plugins/launch/web";
import { Button } from "@/components/ui/button";
import { TaskAttachments } from "./task-attachments";
import { TaskDependencies } from "./task-dependencies";
import { TaskEvents } from "./task-events";
import { useResource } from "@core";
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

export function TaskDetail({ taskId }: { taskId: string }) {
  const { data } = useResource(tasksResource);
  const task = data?.find((t) => t.id === taskId) ?? null;

  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [saving, setSaving] = useState(false);

  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleFocused = useRef(false);

  // Sync local editing state from live resource when not actively editing.
  useEffect(() => {
    if (!task) return;
    if (!titleTimer.current && !titleFocused.current) setTitle(task.title);
    if (!descTimer.current) setDescription(task.description ?? "");
  }, [task?.title, task?.description]);

  const save = useCallback(
    async (
      patch: Partial<{
        title: string;
        description: string | null;
        drop: boolean;
        hold: boolean;
      }>,
    ) => {
      setSaving(true);
      try {
        const res = await fetch(`/api/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (res.ok) {
          // tasksResource broadcast will update task status; consume the body.
          await res.json();
        }
      } finally {
        setSaving(false);
      }
    },
    [taskId],
  );

  const onTitleChange = (v: string) => {
    setTitle(v);
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => {
      titleTimer.current = null;
      void save({ title: v.trim() || "Untitled" });
    }, 500);
  };

  const onDescriptionChange = (v: string) => {
    setDescription(v);
    if (descTimer.current) clearTimeout(descTimer.current);
    descTimer.current = setTimeout(() => {
      descTimer.current = null;
      void save({ description: v });
    }, 500);
  };

  const toggleDrop = () => {
    if (!task) return;
    void save({ drop: task.status !== "dropped" });
  };

  const toggleHold = () => {
    if (!task) return;
    void save({ hold: task.status !== "held" });
  };

  const buildLaunchRequest = useCallback(async () => {
    const trimmedTitle = title.trim() || "Untitled";
    if (titleTimer.current) {
      clearTimeout(titleTimer.current);
      titleTimer.current = null;
    }
    if (descTimer.current) {
      clearTimeout(descTimer.current);
      descTimer.current = null;
    }
    await save({ title: trimmedTitle, description });
    const prompt = description.trim()
      ? `${trimmedTitle}\n\n${description}`
      : trimmedTitle;
    return { taskId, prompt };
  }, [taskId, title, description, save]);

  if (!task) {
    return <div className="text-muted-foreground p-6 text-sm">Loading…</div>;
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-start gap-3">
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          onFocus={() => { titleFocused.current = true; }}
          onBlur={() => {
            titleFocused.current = false;
            void save({ title: title.trim() || "Untitled" });
          }}
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
      <textarea
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        placeholder="Add a description…"
        rows={10}
        className="placeholder:text-muted-foreground min-h-48 w-full resize-y rounded border bg-transparent p-3 text-sm outline-none focus:ring-1 focus:ring-ring"
      />
      <div className="flex justify-end">
        <LaunchButtons
          size="sm"
          getRequest={buildLaunchRequest}
          disabled={!title.trim()}
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
