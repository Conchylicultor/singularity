import { windowQueryResource } from "@plugins/infra/plugins/query-resource/server";
import { taskEffortsResource as taskEffortsDescriptor } from "../../shared/schemas";
import { tasksEffort } from "./tables";

// Compiled bounded POINT resource: the loader reads only the subscribed id set
// (`WHERE parent_id IN (ids)`), and the change feed routes a write to a tuple iff
// the changed row ids intersect its set — so setting or clearing one task's mode
// never recomputes the whole table.
//
// `point.by` IS the identity pk (an entity extension's pk is its `taskId` key),
// so one subscribed id names exactly one task's mode. No orderBy — point sets
// are unordered; callers index by task id.
//
// No `select`: the extension is an entity, so the projection is its wire
// columns.
export const taskEffortsResource = windowQueryResource(taskEffortsDescriptor, {
  from: tasksEffort,
  point: { by: tasksEffort.table.taskId },
});
