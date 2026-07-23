import { useMemo } from "react";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
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

// Map<taskId, categoryId> from the live keyed resource. Empty while pending —
// consumers treat a missing entry as "no category" (the "None" bucket), and the
// resource is boot-critical so it is hydrated before first paint anyway.
export function useTaskCategoryMap(): ReadonlyMap<string, string> {
  const result = useResource(taskCategoriesResource);
  return useMemo(() => {
    if (result.pending) return new Map<string, string>();
    return new Map(result.data.map((r) => [r.parentId, r.category]));
  }, [result]);
}
