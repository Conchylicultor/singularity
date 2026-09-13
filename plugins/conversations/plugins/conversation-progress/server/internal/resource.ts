import { windowQueryResource } from "@plugins/infra/plugins/query-resource/server";
import { conversationProgressResource as conversationProgressDescriptor } from "../../shared/schemas";
import { conversationProgress } from "./tables";

// Compiled bounded POINT resource: the loader reads only the subscribed id set
// (`WHERE parent_id IN (ids)`), and the change-feed routes a progress
// insert/reclassify to a tuple iff the changed conversation ids intersect its
// set — so a phase change never sweeps the whole table. The extension handle is
// the source, so the projection is its `wireColumns` and the identity is its key
// `conversationId` (the `parent_id` PK); `point.by` IS that identity pk. No
// orderBy — point sets are unordered.
export const conversationProgressResource = windowQueryResource(
  conversationProgressDescriptor,
  {
    from: conversationProgress,
    point: { by: conversationProgress.table.conversationId },
  },
);
