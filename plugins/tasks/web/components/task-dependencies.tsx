import { useCallback, useMemo } from "react";
import { MdClose } from "react-icons/md";
import { useResource } from "@core";
import { Button } from "@/components/ui/button";
import { tasksResource, type Task } from "../../shared/resources";
import { taskDetailPane } from "../panes";

const CONVERSATIONS_META_TASK_ID = "task-meta-conversations";

export function TaskDependencies({ taskId }: { taskId: string }) {
  const { data } = useResource(tasksResource);
  const tasks = data ?? [];
  const task = tasks.find((t) => t.id === taskId) ?? null;

  const deps = task?.dependencies ?? [];

  const parentCandidate = useMemo(() => {
    if (!task?.parentId) return null;
    if (task.parentId === CONVERSATIONS_META_TASK_ID) return null;
    if (deps.includes(task.parentId)) return null;
    return tasks.find((t) => t.id === task.parentId) ?? null;
  }, [task?.parentId, deps, tasks]);

  const addParentAsDep = useCallback(async () => {
    if (!parentCandidate) return;
    await fetch(`/api/tasks/${taskId}/dependencies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dependsOnTaskId: parentCandidate.id }),
    });
  }, [taskId, parentCandidate]);

  if (!task) return null;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          Dependencies
        </h3>
        {parentCandidate && (
          <Button size="xs" variant="outline" onClick={addParentAsDep}>
            Add parent as dep
          </Button>
        )}
      </div>
      {deps.length === 0 ? (
        <p className="text-muted-foreground text-sm">No dependencies.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {deps.map((depId) => (
            <DepChip key={depId} taskId={taskId} depId={depId} tasks={tasks} />
          ))}
        </ul>
      )}
    </section>
  );
}

function DepChip({
  taskId,
  depId,
  tasks,
}: {
  taskId: string;
  depId: string;
  tasks: readonly Task[];
}) {
  const dep = tasks.find((t) => t.id === depId) ?? null;
  const title = dep?.title ?? depId;
  const isTerminal = dep ? dep.status === "done" || dep.status === "dropped" : false;

  const open = () => taskDetailPane.open({ taskId: depId });
  const remove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/tasks/${taskId}/dependencies/${depId}`, {
      method: "DELETE",
    });
  };

  return (
    <li>
      <div
        className={`hover:bg-muted flex items-center gap-1 rounded border px-2 py-0.5 text-xs ${
          isTerminal ? "text-muted-foreground line-through" : ""
        }`}
      >
        <button
          type="button"
          onClick={open}
          className="max-w-[24ch] truncate text-left"
          title={title}
        >
          {title}
        </button>
        <button
          type="button"
          onClick={remove}
          className="hover:bg-destructive/10 hover:text-destructive rounded p-0.5"
          aria-label={`Remove dependency ${title}`}
        >
          <MdClose className="h-3 w-3" />
        </button>
      </div>
    </li>
  );
}
