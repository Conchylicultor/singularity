import { useMemo } from "react";
import { MdClose } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { SectionLabel } from "@plugins/primitives/plugins/section-label/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { tasksResource, type TaskListItem } from "@plugins/tasks/core";
import { taskDetailPane } from "@plugins/tasks/plugins/task-detail/web";
import { Row } from "@plugins/primitives/plugins/row/web";

export function TaskDependents({ taskId }: { taskId: string }) {
  const tasksResult = useResource(tasksResource);
  const tasks = useMemo(() => (tasksResult.pending ? [] : tasksResult.data), [tasksResult]);

  const dependentIds = useMemo(
    () => tasks.filter((t) => t.dependencies.includes(taskId)).map((t) => t.id),
    [tasks, taskId],
  );

  return (
    <section className="flex flex-col gap-2">
      <SectionLabel as="h3" className="font-medium">
        Dependents
      </SectionLabel>
      {dependentIds.length === 0 ? (
        <p className="text-muted-foreground text-sm">No dependents.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {dependentIds.map((depId) => (
            <DependentChip key={depId} taskId={taskId} dependentId={depId} tasks={tasks} />
          ))}
        </ul>
      )}
    </section>
  );
}

function DependentChip({
  taskId,
  dependentId,
  tasks,
}: {
  taskId: string;
  dependentId: string;
  tasks: readonly TaskListItem[];
}) {
  const dependent = tasks.find((t) => t.id === dependentId) ?? null;
  const title = dependent?.title ?? dependentId;
  const isTerminal = dependent
    ? dependent.status === "done" || dependent.status === "dropped"
    : false;
  const openPane = useOpenPane();

  const open = () => openPane(taskDetailPane, { taskId: dependentId }, { mode: "swap" });
  const remove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/tasks/${dependentId}/dependencies/${taskId}`, {
      method: "DELETE",
    });
  };

  return (
    <li>
      <Row
        as="div"
        bordered
        size="sm"
        hover="muted"
        actionsAlwaysVisible
        className={isTerminal ? "text-muted-foreground line-through" : undefined}
        actions={
          <button
            type="button"
            onClick={remove}
            className="hover:bg-destructive/10 hover:text-destructive rounded p-0.5"
            aria-label={`Remove dependent ${title}`}
          >
            <MdClose className="h-3 w-3" />
          </button>
        }
      >
        <button
          type="button"
          onClick={open}
          className="max-w-[24ch] truncate text-left"
          title={title}
        >
          {title}
        </button>
      </Row>
    </li>
  );
}
