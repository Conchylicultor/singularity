import { windowQueryResource } from "@plugins/infra/plugins/query-resource/server";
import { taskAutoStartResource as taskAutoStartDescriptor } from "../../shared/resources";
import { _tasksAutoStartExt } from "./tables";

const t = _tasksAutoStartExt;

// Compiled bounded POINT resource: the loader reads only the subscribed id set
// (`WHERE parent_id IN (ids)`), and the change feed routes a write to a tuple iff
// the changed row ids intersect its set — so arming, disarming, claiming or
// sweeping one task's marker never recomputes the whole table.
//
// `point.by` IS the identity pk (an entity extension's pk is its `parent_id`), so
// one subscribed id names exactly one task's marker. No orderBy — point sets are
// unordered; callers index by task id.
//
// The projection drops createdAt/updatedAt (they are not on the wire schema).
export const tasksAutoStartResource = windowQueryResource(
  taskAutoStartDescriptor,
  {
    from: t,
    select: {
      parentId: t.parentId,
      autoStartAt: t.autoStartAt,
      autoStartModel: t.autoStartModel,
    },
    point: { by: t.parentId },
  },
);
