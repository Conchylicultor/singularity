import { queryResource } from "@plugins/infra/plugins/query-resource/server";
import { taskAutoStartResource as taskAutoStartDescriptor } from "../../shared/resources";
import { _tasksAutoStartExt } from "./tables";

// Compiled keyed query-resource: the loader, Layer-2 scoped loader, and
// identityTable ("tasks_ext_auto_start") all derive from this one declaration.
// The projection drops createdAt/updatedAt (they are not on the wire schema).
// A CAS arm/re-arm is an UPDATE on `parent_id` → one scoped keyed delta; arm
// (INSERT) / disarm (DELETE) are membership changes → FULL recompute.
export const tasksAutoStartResource = queryResource(taskAutoStartDescriptor, {
  from: _tasksAutoStartExt,
  select: {
    parentId: _tasksAutoStartExt.parentId,
    autoStartAt: _tasksAutoStartExt.autoStartAt,
    autoStartModel: _tasksAutoStartExt.autoStartModel,
  },
});
