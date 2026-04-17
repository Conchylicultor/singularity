import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Task = {
  id: string;
  parentId: string | null;
  title: string;
  description: string | null;
  status: "new" | "in_progress" | "attempted" | "done" | "held" | "dropped";
  droppedAt: string | null;
  heldAt: string | null;
};

const STATUS_LABELS: Record<Task["status"], string> = {
  new: "New",
  in_progress: "In progress",
  attempted: "Attempted",
  done: "Done",
  held: "Held",
  dropped: "Dropped",
};

const STATUS_CLASSES: Record<Task["status"], string> = {
  new: "bg-muted",
  in_progress: "bg-muted",
  attempted: "bg-muted",
  done: "bg-muted",
  held: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  dropped: "bg-muted text-muted-foreground/60 italic",
};

export function TaskDetail({ taskId }: { taskId: string }) {
  const [task, setTask] = useState<Task | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/tasks/${taskId}`);
      if (!res.ok) return;
      const t = (await res.json()) as Task;
      if (cancelled) return;
      setTask(t);
      setTitle(t.title);
      setDescription(t.description ?? "");
    })();
    return () => {
      cancelled = true;
    };
  }, [taskId]);

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
          // Refresh so derived status badge stays in sync after a drop toggle.
          const refreshed = (await res.json()) as Task;
          setTask((prev) => (prev ? { ...prev, ...refreshed } : prev));
        }
      } finally {
        setSaving(false);
      }
    },
    [taskId],
  );

  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onTitleChange = (v: string) => {
    setTitle(v);
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => {
      void save({ title: v.trim() || "Untitled" });
    }, 500);
  };

  const onDescriptionChange = (v: string) => {
    setDescription(v);
    if (descTimer.current) clearTimeout(descTimer.current);
    descTimer.current = setTimeout(() => {
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

  const [launching, setLaunching] = useState(false);
  const launchAgent = useCallback(async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    setLaunching(true);
    try {
      if (titleTimer.current) {
        clearTimeout(titleTimer.current);
        titleTimer.current = null;
      }
      if (descTimer.current) {
        clearTimeout(descTimer.current);
        descTimer.current = null;
      }
      await save({
        title: trimmedTitle || "Untitled",
        description,
      });
      const prompt = description.trim()
        ? `${trimmedTitle}\n\n${description}`
        : trimmedTitle;
      await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, prompt }),
      });
    } finally {
      setLaunching(false);
    }
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
      <textarea
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        placeholder="Add a description…"
        rows={10}
        className="placeholder:text-muted-foreground min-h-48 w-full resize-y rounded border bg-transparent p-3 text-sm outline-none focus:ring-1 focus:ring-ring"
      />
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => void launchAgent()}
          disabled={launching || !title.trim()}
        >
          {launching ? "Launching…" : "Launch agent"}
        </Button>
      </div>
    </div>
  );
}
