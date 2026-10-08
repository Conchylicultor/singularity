import { useMemo } from "react";
import { useLive } from "@plugins/network/plugins/live/web";
import {
  mapResource,
  useEndpointResource,
  type ResourceResult,
} from "@plugins/primitives/plugins/live-state/web";
import {
  listTaskCategories,
  type TaskCategoryDef,
} from "@plugins/tasks/plugins/task-category/core";
import { taskCategories, type TaskCategoryRow } from "../shared/resources";

const NO_REFETCH = { staleTime: Infinity, gcTime: Infinity } as const;

/**
 * The registered categories: a read — loading, failed, or the list. Static
 * after boot (each filing plugin contributes its own at load time), so cached
 * indefinitely and never refetched. Ordered server-side by `order ?? 0` then
 * id. Not known yet is the loading arm, never an empty registry.
 */
export function useTaskCategories(): ResourceResult<TaskCategoryDef[]> {
  const result = useEndpointResource(listTaskCategories, {}, NO_REFETCH);
  return useMemo(() => mapResource(result, (r) => r.categories), [result]);
}

/** taskId → categoryId, one entry per categorized task. */
export type TaskCategoryMap = ReadonlyMap<string, string>;

// Stable (module-level), so the `select` re-runs only when the set changes.
function toCategoryMap(rows: TaskCategoryRow[]): TaskCategoryMap {
  return new Map(rows.map((r) => [r.taskId, r.category]));
}

/**
 * Every categorized task's category, from the live `task-categories` set: a
 * read — loading, failed, or the map. A task missing from a READY map has no
 * category (the "None" bucket); not loaded yet is the loading arm, never an
 * empty map (which would claim every task is uncategorized). The set is
 * preloaded, so a boot-hydrated read renders ready on its first render.
 */
export function useTaskCategoryMap(): ResourceResult<TaskCategoryMap> {
  return useLive(taskCategories, { select: toCategoryMap });
}
