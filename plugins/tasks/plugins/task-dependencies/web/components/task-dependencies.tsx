import { Button, ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { MdClose } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  Collapsible,
  CollapsibleContent,
} from "@plugins/primitives/plugins/collapsible/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import {
  addTaskDependency,
  removeTaskDependency,
  type TaskChainTarget,
} from "@plugins/tasks/core";
import { tasksResource, isSettled, type TaskListItem } from "@plugins/tasks/plugins/tasks-core/core";
import { useTask } from "@plugins/tasks/web";
import { taskDetailPane } from "@plugins/tasks/plugins/task-detail/web";
import { TaskDraftPopover } from "@plugins/tasks/plugins/task-draft-form/web";
import { Row, SectionHeaderRow } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";

const CONVERSATIONS_META_TASK_ID = "task-meta-conversations";

function targetForSibling(task: TaskListItem): TaskChainTarget {
  if (task.folderId) {
    return { kind: "folder", folderTaskId: task.folderId };
  }
  return { kind: "metaTask", metaTaskId: CONVERSATIONS_META_TASK_ID };
}

export function TaskDependencies({ taskId }: { taskId: string }) {
  const task = useTask(taskId);
  const tasksResult = useResource(tasksResource);

  const deps = task?.dependencies ?? [];

  const folderCandidate = (() => {
    if (!task?.folderId || tasksResult.pending) return null;
    if (task.folderId === CONVERSATIONS_META_TASK_ID) return null;
    if (deps.includes(task.folderId)) return null;
    return tasksResult.data.find((t) => t.id === task.folderId) ?? null;
  })();

  const addFolderAsDep = async () => {
    if (!folderCandidate) return;
    await fetchEndpoint(addTaskDependency, { id: taskId }, { body: { dependsOnTaskId: folderCandidate.id } });
  };

  if (!task) return null;
  if (tasksResult.pending) return <Loading variant="rows" />;

  const target = targetForSibling(task);

  return (
    <Collapsible defaultOpen>
      <Stack gap="sm">
      <SectionHeaderRow
        variant="eyebrow"
        actions={
          <>
            {folderCandidate && (
              <Button variant="outline" onClick={addFolderAsDep}>
                Add folder as dep
              </Button>
            )}
            <TaskDraftPopover
              trigger={<Button variant="outline">+ Prerequisite</Button>}
              target={target}
              relate={{ taskId, defaultMode: "prerequisite" }}
              heading="Add prerequisite"
            />
            <TaskDraftPopover
              trigger={<Button variant="outline">+ Follow-up</Button>}
              target={target}
              relate={{ taskId, defaultMode: "followup" }}
              heading="Add follow-up"
            />
          </>
        }
      >
        Dependencies
      </SectionHeaderRow>
      <CollapsibleContent>
        {deps.length === 0 ? (
          <Text as="p" variant="body" tone="muted">No dependencies.</Text>
        ) : (
          <Stack as="ul" direction="row" wrap gap="sm">
            {deps.map((depId) => (
              <DepChip key={depId} taskId={taskId} depId={depId} tasks={tasksResult.data} />
            ))}
          </Stack>
        )}
      </CollapsibleContent>
      </Stack>
    </Collapsible>
  );
}

function DepChip({
  taskId,
  depId,
  tasks,
}: {
  taskId: string;
  depId: string;
  tasks: readonly TaskListItem[];
}) {
  const dep = tasks.find((t) => t.id === depId) ?? null;
  const title = dep?.title ?? depId;
  const isTerminal = dep ? isSettled(dep.status) : false;
  const openPane = useOpenPane();

  const open = () => openPane(taskDetailPane, { taskId: depId }, { mode: "swap" });
  const remove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await fetchEndpoint(removeTaskDependency, { id: taskId, depId });
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
              label={`Remove dependency ${title}`}
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
