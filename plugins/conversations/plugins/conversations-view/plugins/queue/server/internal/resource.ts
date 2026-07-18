import { windowQueryResource } from "@plugins/infra/plugins/query-resource/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import {
  queueRanksResource as queueRanksDescriptor,
  queuePinResource as queuePinDescriptor,
} from "../../core/resources";
import { conversationsQueue } from "./tables";
import { getPinnedId } from "./pinned";

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
// gives that structurally (a status tick does not write a rank row), and the pin
// — the one thing that DID follow conversation status — now lives in the separate
// scalar `queue-pin` resource below.
export const queueRanksResource = windowQueryResource(queueRanksDescriptor, {
  from: t,
  select: { conversationId: t.parentId, rank: t.rank },
  point: { by: t.parentId },
  ackChannel: true,
});

// Scalar 1-row pin resource. Its read-set is the single `queue_state` row, so the
// change-feed recomputes it only on a pin write — the pin is written
// transactionally by the queue handlers/jobs and revalidated on conversation
// status changes (`pinRevalidateJob`). Pure read; no revalidate/write.
export const queuePinResource = defineResource(queuePinDescriptor, {
  mode: "push",
  loader: async () => ({ pinnedConversationId: await getPinnedId() }),
});
