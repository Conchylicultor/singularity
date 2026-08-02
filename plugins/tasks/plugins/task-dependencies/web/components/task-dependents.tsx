import { MdClose } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { removeTaskDependency } from "@plugins/tasks/core";
import {
  tasksResource,
  TaskGraph,
  isSettled,
  type TaskListItem,
} from "@plugins/tasks/plugins/tasks-core/core";
import { taskDetailPane } from "@plugins/tasks/plugins/task-detail/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";

/**
 * Nothing depends on this task ⇒ nothing to list. Declared as the
 * contribution's `useAvailable` rather than an empty-state placeholder in the
 * body: the host paints the card before it reaches the body, so "No dependents."
 * is a titled bar the user opens onto nothing. Unlike `Dependencies`, this
 * section has no header actions, so with an empty list it has nothing to offer
 * at all.
 */
export function useHasDependents({ taskId }: { taskId: string }): boolean {
  const tasksResult = useResource(tasksResource);
  // Still loading ⇒ keep the card painted (the body shows its own Loading), so
  // it does not pop in a frame after the pane. `false` here would collapse
  // "unknown yet" into "definitely nothing".
  if (tasksResult.pending) return true;
  return TaskGraph.from(tasksResult.data).directDependents(taskId).length > 0;
}

export function TaskDependents({ taskId }: { taskId: string }) {
  const tasksResult = useResource(tasksResource);

  if (tasksResult.pending) return <Loading variant="rows" />;

  const tasks = tasksResult.data;
  const dependentIds = TaskGraph.from(tasks)
    .directDependents(taskId)
    .map((t) => t.id);

  if (dependentIds.length === 0) {
    return <Text as="p" variant="body" tone="muted">No dependents.</Text>;
  }

  return (
    <Stack as="ul" direction="row" wrap gap="sm">
      {dependentIds.map((depId) => (
        <DependentChip key={depId} taskId={taskId} dependentId={depId} tasks={tasks} />
      ))}
    </Stack>
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
  const isTerminal = dependent ? isSettled(dependent.status) : false;
  const openPane = useOpenPane();

  const open = () => openPane(taskDetailPane, { taskId: dependentId }, { mode: "swap" });
  const remove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await fetchEndpoint(removeTaskDependency, { id: dependentId, depId: taskId });
  };

  return (
    <li>
      <Row
        bordered
        size="sm"
        hover="muted"
        actionsAlwaysVisible
        className={isTerminal ? "text-muted-foreground line-through" : undefined}
        actions={
          <ControlSizeProvider size="sm">
            <IconButton
              icon={MdClose}
              label={`Remove dependent ${title}`}
              variant="ghost"
              onClick={remove}
              className="hover:text-destructive"
            />
          </ControlSizeProvider>
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
