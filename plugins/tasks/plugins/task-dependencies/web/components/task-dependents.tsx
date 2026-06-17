import { MdClose } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  Collapsible,
  CollapsibleContent,
} from "@plugins/primitives/plugins/collapsible/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { tasksResource, type TaskListItem, removeTaskDependency } from "@plugins/tasks/core";
import { taskDetailPane } from "@plugins/tasks/plugins/task-detail/web";
import { Row, SectionHeaderRow } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

export function TaskDependents({ taskId }: { taskId: string }) {
  const tasksResult = useResource(tasksResource);

  if (tasksResult.pending) return <Loading variant="rows" />;

  const tasks = tasksResult.data;
  const dependentIds = tasks.filter((t) => t.dependencies.includes(taskId)).map((t) => t.id);

  return (
    <Collapsible defaultOpen className="flex flex-col gap-sm">
      <SectionHeaderRow variant="eyebrow">Dependents</SectionHeaderRow>
      <CollapsibleContent>
        {dependentIds.length === 0 ? (
          <Text as="p" variant="body" tone="muted">No dependents.</Text>
        ) : (
          <ul className="flex flex-wrap gap-sm">
            {dependentIds.map((depId) => (
              <DependentChip key={depId} taskId={taskId} dependentId={depId} tasks={tasks} />
            ))}
          </ul>
        )}
      </CollapsibleContent>
    </Collapsible>
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
    await fetchEndpoint(removeTaskDependency, { id: dependentId, depId: taskId });
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
            className="hover:bg-destructive/10 hover:text-destructive rounded-md p-2xs"
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
