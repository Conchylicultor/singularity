import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { pointQueryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";
import { RankSchema } from "@plugins/primitives/plugins/rank/core";

export const QueueRankRowSchema = z.object({
  conversationId: z.string(),
  rank: RankSchema,
});
export type QueueRankRow = z.infer<typeof QueueRankRowSchema>;

// The CLIENT-ASSEMBLED input type of `classifyQueue` — NO LONGER a wire shape.
// The queue was one `{ ranks[], pinnedConversationId }` push value; it is now a
// bounded POINT ranks resource + a scalar pin resource. The sidebar reassembles
// this shape in-memory from the two so `classifyQueue` stays unchanged.
export const QueueDataSchema = z.object({
  ranks: z.array(QueueRankRowSchema),
  pinnedConversationId: z.string().nullable(),
});
export type QueueData = z.infer<typeof QueueDataSchema>;

// Bounded POINT resource: the queue subscribes by the LIVE conversation id set it
// already tracks (`conversations-active`), so ranks cost O(live) — ~26 rows — not
// O(2726). Rows key on `conversationId` (the ALIAS the server projects the
// side-table's `parent_id` PK under, which IS the point identity). Not
// bootCritical: point resources hydrate post-mount (the recorded decision) — the
// existing all-or-nothing gate shows the loading skeleton for the one round-trip.
export const queueRanksResource = pointQueryResourceDescriptor<QueueRankRow>(
  "queue-ranks",
  QueueRankRowSchema,
  "conversationId",
);

// Scalar 1-row pin resource — a schema-bounded singleton (the
// `build.mainAheadCount` allowed shape). bootCritical so the Current (pinned)
// section is correct at first paint, one round-trip before the ranks land.
export const queuePinResource = resourceDescriptor(
  "queue-pin",
  z.object({ pinnedConversationId: z.string().nullable() }),
  { pinnedConversationId: null },
  { bootCritical: true },
);
