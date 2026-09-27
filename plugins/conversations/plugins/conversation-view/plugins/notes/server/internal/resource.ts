import { serveCollection } from "@plugins/network/plugins/live/server";
import { conversationNoteRows } from "../../shared";
import { conversationNotes } from "./tables";

// Server half of the per-conversation note read: the lookup-only collection
// served from the extension entity (its wire columns — `conversationId` is the
// `parent_id` PK). The `:rows` point routing sends a note upsert / delete to
// the one conversation's tuple alone, so a note edit never sweeps the table.
export const conversationNoteRowsServed = serveCollection(
  conversationNoteRows,
  { from: conversationNotes },
);
