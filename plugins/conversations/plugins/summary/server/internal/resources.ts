import { serveCollection } from "@plugins/network/plugins/live/server";
import { conversationSummaries } from "../../core";
import { _conversationSummaries } from "./tables";

// Server half of the summaries collection: its window and `:rows` point sibling,
// served straight from the entity table. The table row type and the
// `ConversationSummary` wire schema both derive from the single
// `conversationSummaryFields` record (core), so every row field binds to its
// column by name. Rows are append-only: a Summarize press re-reads each
// subscribed window's bounded id list (one per open summary button / pane), and
// only the windows of the summarised conversation gain the row.
export const conversationSummariesServed = serveCollection(
  conversationSummaries,
  { from: _conversationSummaries },
);
