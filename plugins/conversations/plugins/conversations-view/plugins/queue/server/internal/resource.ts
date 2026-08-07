import { windowQueryResource } from "@plugins/infra/plugins/query-resource/server";
import { queueRanksResource as queueRanksDescriptor } from "../../core/resources";
import { conversationsQueue } from "./tables";

const t = conversationsQueue.table;

// Compiled bounded POINT resource: the loader reads only the subscribed id set
// (`WHERE parent_id IN (ids)`) — the queue's LIVE conversation set — and the
// change-feed routes a rank insert/reseat to a tuple iff the changed conversation
// ids intersect its set. So `seedRankJob` on every `conversationCreated` ships a
// single-row point delta to whatever tuple contains that id (structurally none
// until the live set includes it), never a full 2,726-row re-select + persist.
// The PK column `parent_id` is projected under the ALIAS `conversationId` (the
// point identity); `point.by` IS that identity pk. No orderBy — point sets are
// unordered (the client sorts by rank).
//
// `ackChannel: true` is load-bearing: a reorder write that lands OUTSIDE the
// subscribed tuple, or produces a net-zero diff, still emits a standalone ack
// frame so the optimistic overlay confirms via exact-ack (the reorder endpoint's
// returned `{ watermark }` doubles as the ack token).
//
// There is deliberately NO dependsOn the conversations resource: point routing
// gives that structurally — a status tick does not write a rank row. The `pinned`
// flag rides the same row because it is user-set state, not something derived
// from conversation status; the SECTION a pinned row shows up in still follows
// status, but that is computed client-side from the conversations the sidebar
// already holds.
export const queueRanksResource = windowQueryResource(queueRanksDescriptor, {
  from: t,
  select: { conversationId: t.parentId, rank: t.rank, pinned: t.pinned },
  point: { by: t.parentId },
  ackChannel: true,
});
