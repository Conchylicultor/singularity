import { z } from "zod";
import { pointQueryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";
import { RankSchema } from "@plugins/primitives/plugins/rank/core";

// One queue row: the conversation's position (`rank`) plus whether the user
// pinned it. The pin is a plain per-conversation flag living on the SAME row as
// the rank, so it needs no resource of its own — the ranks subscription the
// sidebar already holds carries it.
export const QueueRankRowSchema = z.object({
  conversationId: z.string(),
  rank: RankSchema,
  pinned: z.boolean(),
});
export type QueueRankRow = z.infer<typeof QueueRankRowSchema>;

// The CLIENT-ASSEMBLED input type of `classifyQueue` — NO LONGER a wire shape.
// The queue was one push value; it is now a bounded POINT ranks resource, which
// the sidebar wraps in this shape so `classifyQueue` stays a pure function of
// plain data.
export const QueueDataSchema = z.object({
  ranks: z.array(QueueRankRowSchema),
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
