import { useMemo } from "react";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  foldResource,
  useResource,
} from "@plugins/primitives/plugins/live-state/web";
import {
  listTaskCategories,
  type TaskCategoryDef,
} from "@plugins/tasks/plugins/task-category/core";
import { taskCategoriesResource } from "../shared/resources";

// Categories are static after boot (each filing plugin contributes its own at
// load time), so cache indefinitely — never refetch. Ordered server-side by
// `order ?? 0` then id.
export function useTaskCategories(): TaskCategoryDef[] {
  const { data } = useEndpoint(
    listTaskCategories,
    {},
    { staleTime: Infinity, gcTime: Infinity },
  );
  return data?.categories ?? [];
}

// Map<taskId, categoryId> from the live keyed resource. Empty while loading or
// failed — consumers treat a missing entry as "no category" (the "None"
// bucket), the category is cosmetic grouping, and the resource is
// boot-critical so it is hydrated before first paint anyway.
export function useTaskCategoryMap(): ReadonlyMap<string, string> {
  const result = useResource(taskCategoriesResource);
  return useMemo(() => {
    return foldResource(result, {
      loading: () => new Map<string, string>(),
      error: () => new Map<string, string>(),
      ready: (rows) => new Map(rows.map((r) => [r.taskId, r.category])),
    });
  }, [result]);
}
