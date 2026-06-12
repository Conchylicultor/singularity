import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import { useMemo, useState, useCallback } from "react";
import { MdAdd } from "react-icons/md";
import { useResource, ResourceView } from "@plugins/primitives/plugins/live-state/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import {
  RenameInput,
  RowChrome,
  TreeList,
  hideTerminalSubtrees,
  type TreeItem,
} from "@plugins/primitives/plugins/tree/web";
import { buildTree, type TreeNode } from "@plugins/primitives/plugins/tree/core";
import type { TaskStatus } from "@plugins/tasks/plugins/tasks-core/core";
import { tasksResource, createTask, type TaskListItem } from "@plugins/tasks/core";
import { patchTask } from "@plugins/tasks/web";
import { Tasks as TasksSlots } from "@plugins/tasks/plugins/task-list/web";
import { StatusIcon } from "@plugins/tasks/plugins/task-status/web";
import {
  MultiSelectProvider,
  SelectionBar,
  SelectionCheckbox,
} from "@plugins/primitives/plugins/multi-select/web";
import type { Rank } from "@plugins/primitives/plugins/rank/core";

type Task = TreeItem & {
  title: string;
  status: TaskStatus;
};

// The generic tree primitive speaks `parentId`; the tasks domain stores the
// display hierarchy as `folderId`. Map at this boundary so the primitive stays
// domain-neutral and the folder concept never leaks into it.
async function createTaskRow(args: {
  parentId: string | null;
  rank?: Rank;
}): Promise<string> {
  const task = await fetchEndpoint(createTask, {}, { body: { folderId: args.parentId, rank: args.rank?.toString() } });
  return task.id;
}

function TaskRow({ node, depth }: { node: TreeNode<Task>; depth: number }) {
  const hasChildren = node.children.length > 0;
  const dropped = node.status === "dropped";
  const done = node.status === "done";
  return (
    <RowChrome
      node={node}
      depth={depth}
      menu={({ addBelow }) => [
        {
          icon: MdAdd,
          label: "Add item below",
          onClick: () => void addBelow(),
        },
      ]}
      actions={
        <TasksSlots.TaskActions.Render>
          {(a) => <a.component taskId={node.id} hasChildren={hasChildren} />}
        </TasksSlots.TaskActions.Render>
      }
    >
      <SelectionCheckbox id={node.id} />
      <StatusIcon status={node.status} />
      <RenameInput
        nodeId={node.id}
        value={node.title}
        onCommit={(next) => patchTask(node.id, { title: next })}
        className={cn(
          dropped && "text-muted-foreground/70 line-through italic",
          done && "text-muted-foreground",
        )}
      />
    </RowChrome>
  );
}


function deriveVisibleOrder(
  rows: readonly Task[],
  rootId?: string,
  terminalFilter?: (row: Task) => boolean,
): string[] {
  const scoped = rootId ? rows.filter((r) => isInSubtree(rows, rootId, r.id)) : rows;
  let tree = buildTree(scoped);
  if (terminalFilter) tree = hideTerminalSubtrees(tree, terminalFilter);
  const ids: string[] = [];
  function walk(nodes: TreeNode<Task>[]) {
    for (const n of nodes) {
      ids.push(n.id);
      if (n.expanded) walk(n.children);
    }
  }
  walk(tree);
  return ids;
}

function isInSubtree(
  rows: readonly Task[],
  rootId: string,
  candidateId: string,
): boolean {
  if (candidateId === rootId) return true;
  const parents = new Map(rows.map((r) => [r.id, r.parentId] as const));
  let cur: string | null = parents.get(candidateId) ?? null;
  while (cur) {
    if (cur === rootId) return true;
    cur = parents.get(cur) ?? null;
  }
  return false;
}

function TasksListInner({
  rawRows,
  selectedId,
  rootTaskId,
  onSelect,
}: {
  rawRows: readonly TaskListItem[];
  selectedId?: string;
  rootTaskId?: string;
  onSelect: (id: string) => void;
}) {
  const [hideTerminal, setHideTerminal] = useState(true);
  // Project the tasks' folder hierarchy onto the tree primitive's parentId.
  const rows = useMemo<Task[]>(
    () => rawRows.map((t) => ({ ...t, parentId: t.folderId })),
    [rawRows],
  );
  const isTerminal = useCallback(
    (t: Task) => t.status === "done" || t.status === "dropped",
    [],
  );
  const orderedIds = useMemo(
    () => deriveVisibleOrder(rows, rootTaskId, hideTerminal ? isTerminal : undefined),
    [rows, rootTaskId, hideTerminal, isTerminal],
  );

  return (
    <MultiSelectProvider orderedIds={orderedIds}>
      <SelectionBar />
      <TreeList<Task>
        rows={rows}
        rootId={rootTaskId}
        selectedId={selectedId}
        onSelect={onSelect}
        onToggleExpanded={(id, next) => patchTask(id, { expanded: next })}
        onMove={(id, dest) => patchTask(id, { folderId: dest.parentId, rank: dest.rank })}
        onCreate={createTaskRow}
        Row={TaskRow}
        dragOverlay={(t) => t.title || "Untitled"}
        toolbar={{
          expandAll: true,
          search: { accessor: (t) => t.title },
          hideTerminal: {
            isTerminal,
            value: hideTerminal,
            onValueChange: setHideTerminal,
          },
          start: <TasksSlots.ListActions.Render />,
        }}
        addLabel={rootTaskId ? null : "Add"}
      />
    </MultiSelectProvider>
  );
}

export function TasksList({
  selectedId,
  rootTaskId,
  onSelect,
}: {
  selectedId?: string;
  rootTaskId?: string;
  onSelect: (id: string) => void;
}) {
  const result = useResource(tasksResource);
  return (
    <ResourceView resource={result} fallback={<Loading variant="rows" />}>
      {(rawRows) => (
        <TasksListInner
          rawRows={rawRows}
          selectedId={selectedId}
          rootTaskId={rootTaskId}
          onSelect={onSelect}
        />
      )}
    </ResourceView>
  );
}
