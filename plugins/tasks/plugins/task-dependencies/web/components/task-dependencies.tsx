import { useCallback, useMemo } from "react";
import { MdClose } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { SectionLabel } from "@plugins/primitives/plugins/section-label/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Button } from "@/components/ui/button";
import { tasksResource, type Task } from "@plugins/tasks/core";
import { useTask } from "@plugins/tasks/web";
import { taskDetailPane } from "@plugins/tasks/plugins/task-detail/web";
import {
  TaskDraftPopover,
  type TaskChainTarget,
} from "@plugins/tasks/plugins/task-draft-form/web";

const CONVERSATIONS_META_TASK_ID = "task-meta-conversations";

function targetForSibling(task: Task): TaskChainTarget {
  if (task.parentId) {
    return { kind: "child", parentTaskId: task.parentId };
  }
  return { kind: "metaTask", metaTaskId: CONVERSATIONS_META_TASK_ID };
}

export function TaskDependencies({ taskId }: { taskId: string }) {
  const task = useTask(taskId);
  const { data: tasks } = useResource(tasksResource);

  const deps = useMemo(() => task?.dependencies ?? [], [task?.dependencies]);

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

  const target = targetForSibling(task);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <SectionLabel as="h3" className="font-medium">
          Dependencies
        </SectionLabel>
        <div className="flex items-center gap-1">
          {parentCandidate && (
            <Button size="xs" variant="outline" onClick={addParentAsDep}>
              Add parent as dep
            </Button>
          )}
          <TaskDraftPopover
            trigger="+ Prerequisite"
            triggerClassName="text-xs px-2 py-0.5 rounded border hover:bg-muted cursor-pointer"
            target={target}
            relate={{ taskId, defaultMode: "prerequisite" }}
            captures={["parentTask"]}
            heading="Add prerequisite"
          />
          <TaskDraftPopover
            trigger="+ Follow-up"
            triggerClassName="text-xs px-2 py-0.5 rounded border hover:bg-muted cursor-pointer"
            target={target}
            relate={{ taskId, defaultMode: "followup" }}
            captures={["parentTask"]}
            heading="Add follow-up"
          />
        </div>
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
  const openPane = useOpenPane();

  const open = () => openPane(taskDetailPane, { taskId: depId }, { replace: true });
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
