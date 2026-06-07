import { useCallback, useMemo } from "react";
import { MdClose } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  Collapsible,
  CollapsibleContent,
} from "@plugins/primitives/plugins/collapsible/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Button } from "@/components/ui/button";
import { tasksResource, type TaskListItem } from "@plugins/tasks/core";
import { useTask } from "@plugins/tasks/web";
import { taskDetailPane } from "@plugins/tasks/plugins/task-detail/web";
import { TaskDraftPopover } from "@plugins/tasks/plugins/task-draft-form/web";
import type { TaskChainTarget } from "@plugins/tasks/core";
import { Row, SectionHeaderRow } from "@plugins/primitives/plugins/row/web";

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

  const deps = useMemo(() => task?.dependencies ?? [], [task?.dependencies]);

  const folderCandidate = useMemo(() => {
    if (!task?.folderId || tasksResult.pending) return null;
    if (task.folderId === CONVERSATIONS_META_TASK_ID) return null;
    if (deps.includes(task.folderId)) return null;
    return tasksResult.data.find((t) => t.id === task.folderId) ?? null;
  }, [task?.folderId, deps, tasksResult]);

  const addFolderAsDep = useCallback(async () => {
    if (!folderCandidate) return;
    await fetch(`/api/tasks/${taskId}/dependencies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dependsOnTaskId: folderCandidate.id }),
    });
  }, [taskId, folderCandidate]);

  if (!task) return null;

  const target = targetForSibling(task);

  return (
    <Collapsible defaultOpen className="flex flex-col gap-2">
      <SectionHeaderRow
        variant="eyebrow"
        actions={
          <>
            {folderCandidate && (
              <Button size="xs" variant="outline" onClick={addFolderAsDep}>
                Add folder as dep
              </Button>
            )}
            <TaskDraftPopover
              trigger="+ Prerequisite"
              triggerClassName="text-xs px-2 py-0.5 rounded border hover:bg-muted cursor-pointer"
              target={target}
              relate={{ taskId, defaultMode: "prerequisite" }}
              heading="Add prerequisite"
            />
            <TaskDraftPopover
              trigger="+ Follow-up"
              triggerClassName="text-xs px-2 py-0.5 rounded border hover:bg-muted cursor-pointer"
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
          <p className="text-muted-foreground text-sm">No dependencies.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {deps.map((depId) => (
              <DepChip key={depId} taskId={taskId} depId={depId} tasks={tasksResult.pending ? [] : tasksResult.data} />
            ))}
          </ul>
        )}
      </CollapsibleContent>
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
  const isTerminal = dep ? dep.status === "done" || dep.status === "dropped" : false;
  const openPane = useOpenPane();

  const open = () => openPane(taskDetailPane, { taskId: depId }, { mode: "swap" });
  const remove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/tasks/${taskId}/dependencies/${depId}`, {
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
            aria-label={`Remove dependency ${title}`}
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
