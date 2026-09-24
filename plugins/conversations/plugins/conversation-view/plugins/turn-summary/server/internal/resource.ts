import { windowQueryResource } from "@plugins/infra/plugins/query-resource/server";
import { turnSummariesResource as turnSummariesDescriptor } from "../../shared";
import { turnSummaries } from "./tables";

// Compiled bounded POINT resource: the loader reads only the subscribed id set
// (`WHERE parent_id IN (ids)`), and the change feed routes a write to a tuple iff
// the changed row ids intersect its set — so a new summary for one conversation
// never recomputes the whole table.
//
// `point.by` IS the identity pk (an entity extension's pk is its
// `conversationId` key), so one subscribed id names exactly one conversation's
// summary. No orderBy — point sets are unordered.
//
// No `select`: the extension is an entity, so the projection is its wire
// columns — a column added to the shape reaches the wire with no loader change.
export const turnSummariesResource = windowQueryResource(
  turnSummariesDescriptor,
  {
    from: turnSummaries,
    point: { by: turnSummaries.table.conversationId },
  },
);
