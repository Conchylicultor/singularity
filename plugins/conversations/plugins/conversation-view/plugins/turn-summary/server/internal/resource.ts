import { serveCollection } from "@plugins/network/plugins/live/server";
import { turnSummaryRows } from "../../shared";
import { turnSummaries } from "./tables";

// Server half of the per-conversation summary read: the lookup-only collection
// served from the extension entity (its wire columns — `conversationId` is the
// `parent_id` PK). The loader reads only the subscribed id set (`WHERE
// parent_id IN (ids)`), and the `:rows` point routing schedules a new summary
// for one conversation on that conversation's tuple alone, instead of
// recomputing the whole table.
//
// The projection is exactly `TurnSummarySchema`'s keys, bound by name to the
// extension's wire columns — a field added to the shape reaches the wire with
// no loader change.
export const turnSummaryRowsServed = serveCollection(turnSummaryRows, {
  from: turnSummaries,
});
