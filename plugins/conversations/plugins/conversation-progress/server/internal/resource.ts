import { windowQueryResource } from "@plugins/infra/plugins/query-resource/server";
import { conversationProgressResource as conversationProgressDescriptor } from "../../shared/schemas";
import { conversationProgress } from "./tables";

// Compiled bounded POINT resource: the loader reads only the subscribed id set
// (`WHERE parent_id IN (ids)`), and the change-feed routes a progress
// insert/reclassify to a tuple iff the changed conversation ids intersect its
// set — so a phase change never sweeps the whole table. The PK column
// `parent_id` is projected under the ALIAS `conversationId` (the point identity);
// `point.by` IS that identity pk. No orderBy — point sets are unordered.
export const conversationProgressResource = windowQueryResource(conversationProgressDescriptor, {
  from: conversationProgress.table,
  select: {
    conversationId: conversationProgress.table.parentId,
    phase: conversationProgress.table.phase,
    source: conversationProgress.table.source,
    updatedAt: conversationProgress.table.updatedAt,
  },
  point: { by: conversationProgress.table.parentId },
});
