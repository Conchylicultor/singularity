import { queryResource } from "@plugins/infra/plugins/query-resource/server";
import { taskCategoriesResource as taskCategoriesDescriptor } from "../../shared/resources";
import { _tasksCategoryExt } from "./tables";

// Compiled keyed query-resource — the default identityTable-scoped keyed
// resource. Plain (unbounded) `queryResource` on purpose: the set is bounded by
// the domain — at most one row per task, co-bounded with the already
// boot-critical unbounded-legacy `tasks` resource — and migrates to the bounded
// working-set contract together with it.
export const taskCategoriesServerResource = queryResource(taskCategoriesDescriptor, {
  from: _tasksCategoryExt,
  select: {
    parentId: _tasksCategoryExt.parentId,
    category: _tasksCategoryExt.category,
  },
});
