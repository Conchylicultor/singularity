import { windowQueryResource } from "@plugins/infra/plugins/query-resource/server";
import { taskAutoStartResource as taskAutoStartDescriptor } from "../../shared/resources";
import { tasksAutoStart } from "./tables";

// Compiled bounded POINT resource: the loader reads only the subscribed id set
// (`WHERE parent_id IN (ids)`), and the change feed routes a write to a tuple iff
// the changed row ids intersect its set — so arming, disarming, claiming or
// sweeping one task's marker never recomputes the whole table.
//
// `point.by` IS the identity pk (an entity extension's pk is its `taskId` key),
// so one subscribed id names exactly one task's marker. No orderBy — point sets
// are unordered; callers index by task id.
//
// No `select`: the extension is an entity, so the projection is its wire
// columns (createdAt/updatedAt stay off the wire).
export const tasksAutoStartResource = windowQueryResource(
  taskAutoStartDescriptor,
  {
    from: tasksAutoStart,
    point: { by: tasksAutoStart.table.taskId },
  },
);
