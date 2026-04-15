import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Task = {
  id: string;
  parentId: string | null;
  title: string;
  description: string | null;
  status: string;
};

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "todo", label: "Todo" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
];

export function TaskDetail({ taskId }: { taskId: string }) {
  const [task, setTask] = useState<Task | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("todo");
  const [saving, setSaving] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

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
      setStatus(t.status);
    })();
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  const didAutoFocus = useRef(false);
  useEffect(() => {
    if (didAutoFocus.current) return;
    if (!task || task.title !== "Untitled") return;
    didAutoFocus.current = true;
    titleInputRef.current?.focus();
    titleInputRef.current?.select();
  }, [task]);

  const save = useCallback(
    async (patch: Partial<Pick<Task, "title" | "description" | "status">>) => {
      setSaving(true);
      try {
        await fetch(`/api/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
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

  const onStatusChange = (v: string) => {
    setStatus(v);
    void save({ status: v });
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
        status,
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
  }, [taskId, title, description, status, save]);

  if (!task) {
    return (
      <div className="text-muted-foreground p-6 text-sm">Loading…</div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-start gap-3">
        <input
          ref={titleInputRef}
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Untitled"
          className="flex-1 bg-transparent text-xl font-semibold outline-none placeholder:text-muted-foreground focus:ring-0"
        />
        <span className="text-muted-foreground pt-1 text-xs">
          {saving ? "Saving…" : "Saved"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-muted-foreground text-xs uppercase tracking-wide">
          Status
        </label>
        <select
          value={status}
          onChange={(e) => onStatusChange(e.target.value)}
          className="bg-background hover:bg-accent rounded border px-2 py-1 text-sm outline-none"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
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
