import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  addTaskDependency,
  type TaskChainTarget,
} from "@plugins/tasks/core";
import { tasksResource, type TaskListItem } from "@plugins/tasks/plugins/tasks-core/core";
import { useTaskCategoryMap } from "@plugins/tasks/plugins/task-category/web";
import { useTask } from "@plugins/tasks/web";
import { TaskDraftPopover } from "@plugins/tasks/plugins/task-draft-form/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { SectionLabel, Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import {
  RELATION_DIRECTIONS,
  RelationChip,
  type RelationDirection,
} from "../internal/relations";

function targetForSibling(
  task: TaskListItem,
  categoryMap: ReadonlyMap<string, string>,
): TaskChainTarget {
  if (task.folderId) {
    return { kind: "folder", folderTaskId: task.folderId };
  }
  const categoryId = categoryMap.get(task.id);
  if (categoryId) {
    return { kind: "category", categoryId };
  }
  return { kind: "root" };
}

/**
 * The section's header controls, contributed as the section's `actions` so they
 * stay reachable while the card is collapsed. Re-reads the same live resources
 * as the body — both are cached reads of one query, not a second fetch.
 *
 * They already covered BOTH directions of the relation (`+ Prerequisite` adds an
 * edge in, `+ Follow-up` adds one out), which is the reason the two former
 * `Dependencies` / `Dependents` cards are now one: the add affordances were
 * never split the way the read-only lists were.
 */
export function TaskDependenciesActions({ taskId }: { taskId: string }) {
  const task = useTask(taskId);
  const tasksResult = useResource(tasksResource);
  const categoryMap = useTaskCategoryMap();

  const deps = task?.dependencies ?? [];

  const folderCandidate = (() => {
    if (!task?.folderId || tasksResult.pending) return null;
    if (deps.includes(task.folderId)) return null;
    return tasksResult.data.find((t) => t.id === task.folderId) ?? null;
  })();

  const addFolderAsDep = async () => {
    if (!folderCandidate) return;
    await fetchEndpoint(addTaskDependency, { id: taskId }, { body: { dependsOnTaskId: folderCandidate.id } });
  };

  if (!task || tasksResult.pending) return null;

  const target = targetForSibling(task, categoryMap);

  return (
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
  );
}

/**
 * Both ends of the task's dependency edges in ONE card: what it runs after, and
 * what it blocks. They were two sibling cards with identical chrome and chips;
 * the split was a rendering accident (two lists) rather than a user-facing
 * distinction (one relation, read from two ends), and it cost a whole card of
 * vertical space plus a second title to scan.
 */
export function TaskDependencies({ taskId }: { taskId: string }) {
  const tasksResult = useResource(tasksResource);

  if (tasksResult.pending) return <Loading variant="rows" />;

  const tasks = tasksResult.data;
  const groups = RELATION_DIRECTIONS.map((direction) => ({
    direction,
    ids: direction.idsFor(taskId, tasks),
  })).filter((g) => g.ids.length > 0);

  if (groups.length === 0) {
    // The card stays painted when empty (unlike a body-less section): its header
    // actions are how the first relation gets added.
    return (
      <Text as="p" variant="body" tone="muted">
        No dependencies yet.
      </Text>
    );
  }

  return (
    <Stack direction="col" gap="md">
      {groups.map(({ direction, ids }) => (
        <RelationGroup
          key={direction.id}
          taskId={taskId}
          direction={direction}
          ids={ids}
          tasks={tasks}
        />
      ))}
    </Stack>
  );
}

/**
 * One direction: its eyebrow label over the wrapping chip cluster. Stacked
 * rather than a label rail beside the chips, so the group survives a narrow
 * pane (the chips wrap into the full width instead of a squeezed column) and the
 * label needs no vertical-alignment fudging against the first chip row.
 */
function RelationGroup({
  taskId,
  direction,
  ids,
  tasks,
}: {
  taskId: string;
  direction: RelationDirection;
  ids: readonly string[];
  tasks: readonly TaskListItem[];
}) {
  return (
    <Stack direction="col" gap="xs">
      <SectionLabel>{direction.label}</SectionLabel>
      <Cluster as="ul">
        {ids.map((otherId) => (
          <RelationChip
            key={otherId}
            taskId={taskId}
            otherId={otherId}
            direction={direction}
            tasks={tasks}
          />
        ))}
      </Cluster>
    </Stack>
  );
}
