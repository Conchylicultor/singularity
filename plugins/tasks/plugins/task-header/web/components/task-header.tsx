import { useCallback } from "react";
import { LaunchButtons } from "@plugins/primitives/plugins/launch/web";
import { useEditableField } from "@plugins/primitives/plugins/editable-field/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { type Task } from "@plugins/tasks/shared";
import { patchTask, setAutoStart, useTask } from "@plugins/tasks/web";
import { useTaskAutoStart } from "@plugins/tasks/plugins/auto-start/web";
import { buildTaskPrompt } from "@plugins/tasks-core/shared";
import { useFlushAll, useRegisterFlush } from "@plugins/tasks/plugins/task-detail/web";
import { StatusBadge } from "@plugins/tasks/plugins/task-status/web";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AuthorDisplay } from "./author-display";

export function TaskHeader({ taskId }: { taskId: string }) {
  const task = useTask(taskId);
  const autoStart = useTaskAutoStart(taskId);
  const flushAll = useFlushAll();

  const titleField = useEditableField({
    value: task?.title ?? "",
    onSave: (v) => patchTask(taskId, { title: v.trim() || "Untitled" }),
  });
  useRegisterFlush(titleField.flush);

  const toggleDrop = () => {
    if (!task) return;
    void patchTask(taskId, { drop: task.status !== "dropped" });
  };

  const toggleHold = () => {
    if (!task) return;
    void patchTask(taskId, { hold: task.status !== "held" });
  };

  const onAutoStartChange = useCallback(
    (model: "opus" | "sonnet" | "none") => setAutoStart(taskId, model),
    [taskId],
  );

  const buildLaunchRequest = useCallback(async () => {
    await flushAll();
    const fresh = await fetch(`/api/tasks/${taskId}`).then((r) =>
      r.ok ? (r.json() as Promise<Task>) : null,
    );
    return { taskId, prompt: buildTaskPrompt(fresh ?? task ?? {}) };
  }, [taskId, task, flushAll]);

  if (!task) return null;

  return (
    <div className="flex flex-col gap-4">
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
          {titleField.isSaving ? "Saving…" : "Saved"}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground text-xs uppercase tracking-wide">
          Status
        </span>
        <StatusBadge status={task.status} />
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
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground text-xs uppercase tracking-wide">
          Created
        </span>
        <span className="text-xs">
          <RelativeTime date={new Date(task.createdAt)} />
        </span>
      </div>
      {task.finishedAt != null && (
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-xs uppercase tracking-wide">
            Closed
          </span>
          <span className="text-xs">
            <RelativeTime date={new Date(task.finishedAt)} />
          </span>
        </div>
      )}
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground text-xs uppercase tracking-wide">
          Auto-start
        </span>
        <Select
          value={autoStart?.autoStartModel ?? "none"}
          onValueChange={(v: string | null) => {
            if (v) void onAutoStartChange(v as "opus" | "sonnet" | "none");
          }}
        >
          <SelectTrigger className="h-7 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Off</SelectItem>
            <SelectItem value="sonnet">Sonnet</SelectItem>
            <SelectItem value="opus">Opus</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-end">
        <LaunchButtons
          size="sm"
          getRequest={buildLaunchRequest}
          disabled={!titleField.value.trim()}
          className="w-auto"
          openAfterLaunch={false}
        />
      </div>
    </div>
  );
}
