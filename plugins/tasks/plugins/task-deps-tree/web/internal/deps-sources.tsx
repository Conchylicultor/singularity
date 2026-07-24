import { useMemo, type ReactElement } from "react";
import {
  defineDataViewSources,
  type DataViewSourceProps,
  type HierarchyConfig,
} from "@plugins/primitives/plugins/data-view/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import type { TaskListItem } from "@plugins/tasks/plugins/tasks-core/core";
import { moveTaskInDepsTree } from "@plugins/tasks/core";
import {
  Tasks,
  taskFields,
  clusterTaskHierarchy,
  buildTreeOptions,
} from "@plugins/tasks/plugins/task-list/web";
import {
  buildDepsTree,
  type DepsTreeRow,
} from "@plugins/tasks/plugins/task-deps-tree/core";
import { depsTreeFields, depsTreeOptions } from "./deps-tree-fields";
import { DepsActions } from "./deps-actions";

/** The host props the deps-tree section threads to both sources. */
export interface DepsHostProps {
  taskId: string;
  allTasks: readonly TaskListItem[];
  memberIds: ReadonlySet<string>;
  onNavigate: (id: string) => void;
}

/**
 * The source slot for the merged deps-tree DataView. Both sources are
 * contributed by this plugin's own `web/index.ts` — nothing ever imports
 * deps-tree for this, so the existing `task-deps-tree → task-list` import
 * direction is preserved (the Created source composes from task-list's exported
 * building blocks, which is the supported reuse path: a source's `render(bundle)`
 * IS the inner DataView, so a component that owns its own cannot be a source).
 */
export const DepsSources =
  defineDataViewSources<DepsHostProps>("task-deps-tree-sources");

// Every `task_dependencies` edge is a literal tree edge, so the tree's shape IS
// the dependency relation. A drop is neighbour-based, not rank-based: a drop
// ONTO a row (`targetId === null`) splices into the chain; a sibling-zone drop
// branches. `dest.rank` is discarded — the server owns edge rewiring atomically.
const depsHierarchy: HierarchyConfig<DepsTreeRow> = {
  getParentId: (r) => r.depsParentId,
  getRank: (r) => r.rank,
  onMove: (id, dest) =>
    fetchEndpoint(
      moveTaskInDepsTree,
      { id },
      {
        body: {
          newParentId: dest.parentId,
          mode: dest.targetId === null ? "splice" : "branch",
        },
      },
    ),
};

/**
 * The Dependencies source: the cluster organised by its `task_dependencies`
 * edges (nesting = runs-after), with atomic drag-to-rewire and the
 * 'also after' fan-in chips.
 */
export function DepsSource({
  hostProps,
  render,
}: DataViewSourceProps<DepsHostProps>): ReactElement {
  const { taskId, allTasks, memberIds, onNavigate } = hostProps;
  const rows = useMemo(
    () => buildDepsTree(allTasks, memberIds),
    [allTasks, memberIds],
  );
  return (
    <>
      {render<DepsTreeRow>({
        rows,
        fields: depsTreeFields,
        rowKey: (r) => r.id,
        hierarchy: depsHierarchy,
        viewOptions: { tree: depsTreeOptions },
        itemActions: DepsActions,
        selectedRowId: taskId,
        onRowActivate: (r) => onNavigate(r.id),
      })}
    </>
  );
}

/**
 * The Created source: the same cluster organised by its creation structure
 * (`folderId` forest) — read-only, ephemeral expand state, every node open by
 * default. Composed from task-list's exported building blocks.
 */
export function CreatedSource({
  hostProps,
  render,
}: DataViewSourceProps<DepsHostProps>): ReactElement {
  const { taskId, allTasks, memberIds, onNavigate } = hostProps;
  // The rows are already the exact member set, so no subtree scoping —
  // out-of-set parents make their children render as roots (the creation forest).
  const rows = useMemo(
    () => allTasks.filter((t) => memberIds.has(t.id)),
    [allTasks, memberIds],
  );
  const treeOptions = useMemo(
    () => buildTreeOptions({ readOnly: true, defaultExpanded: true }),
    [],
  );
  return (
    <>
      {render<TaskListItem>({
        rows,
        fields: taskFields,
        rowKey: (t) => t.id,
        hierarchy: clusterTaskHierarchy,
        viewOptions: { tree: treeOptions },
        selection: {},
        itemActions: Tasks.TaskActions,
        selectedRowId: taskId,
        onRowActivate: (t) => onNavigate(t.id),
      })}
    </>
  );
}
