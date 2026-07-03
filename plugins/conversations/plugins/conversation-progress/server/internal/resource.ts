import { asc } from "drizzle-orm";
import { queryResource } from "@plugins/infra/plugins/query-resource/server";
import { conversationProgressResource as conversationProgressDescriptor } from "../../shared/schemas";
import { conversationProgress } from "./tables";

// Compiled keyed query-resource: the loader, Layer-2 scoped loader, and
// identityTable ("conversations_ext_progress") all derive from this one
// declaration. The PK column `parent_id` is projected under the ALIAS
// `conversationId` — the compiler keys the resource on the alias (matching the
// descriptor's pkField) while the scoped refill still filters on the real
// column. A phase reclassification is an UPDATE → one scoped keyed delta.
export const conversationProgressResource = queryResource(conversationProgressDescriptor, {
  from: conversationProgress.table,
  select: {
    conversationId: conversationProgress.table.parentId,
    phase: conversationProgress.table.phase,
    source: conversationProgress.table.source,
    updatedAt: conversationProgress.table.updatedAt,
  },
  orderBy: asc(conversationProgress.table.parentId),
});
