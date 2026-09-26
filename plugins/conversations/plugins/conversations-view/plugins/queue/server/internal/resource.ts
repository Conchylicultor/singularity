import { serveCollection } from "@plugins/network/plugins/live/server";
import { queueRanks } from "../../core/resources";
import { conversationsQueue } from "./tables";

// The queue rows, served from the queue extension's side-table. The extension
// handle is the source, so every row field binds to one of its wire columns
// and the id is its key `conversationId` (the `parent_id` PK). The sidebar's
// `{ ids }` read is the `:rows` point sibling: a rank insert/reseat reaches a
// tuple iff the changed conversation ids intersect its set, so `seedRankJob` on
// every `conversationCreated` ships a single-row delta to whatever tuple holds
// that id (none until the live set includes it), never a full re-select.
//
// A reorder write that lands OUTSIDE the subscribed id set, or nets to zero,
// still confirms the sidebar's optimistic op: the optimistic hook ASKS for
// standalone ack frames on its tuple, and the reorder endpoint's returned
// `{ watermark }` is the ack token. Nothing is declared here.
//
// There is deliberately NO dependency on the conversations resource: point
// routing gives that structurally — a status tick does not write a rank row.
// The `pinned` flag rides the same row because it is user-set state, not
// something derived from conversation status; the SECTION a pinned row shows up
// in still follows status, but that is computed client-side from the
// conversations the sidebar already holds.
export const queueRanksServed = serveCollection(queueRanks, {
  from: conversationsQueue,
});
