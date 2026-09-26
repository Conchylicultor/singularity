import { z } from "zod";
import { pointQueryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";
import { RankSchema } from "@plugins/primitives/plugins/rank/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { rankField } from "@plugins/fields/plugins/rank/plugins/config/core";
import { defineExtensionShape } from "@plugins/infra/plugins/entity-extensions/core";

// One queue row: the conversation's position (`rank`) plus whether the user
// pinned it. The pin is a plain per-conversation flag living on the SAME row as
// the rank, so it needs no resource of its own — the ranks subscription the
// sidebar already holds carries it. `server/internal/tables.ts` builds the
// `conversations_ext_queue` table from this shape.
export const queueShape = defineExtensionShape({
  key: "conversationId",
  fields: { rank: rankField(), pinned: boolField() },
});
// The wire row is the shape's schema with `rank` decoded into a `Rank`. The
// `rank_text` column's field can only say `string`, so the decode is layered on
// here; an `.extend` replaces a key but can never drop one, so every column of
// the shape still reaches the wire.
export const QueueRankRowSchema = queueShape.schema.extend({
  rank: RankSchema,
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
// O(2726). Rows key on `conversationId` (the extension's key, whose column is
// the side-table's `parent_id` PK, which IS the point identity). Not
// preloaded: point resources hydrate post-mount (the recorded decision) — the
// existing all-or-nothing gate shows the loading skeleton for the one round-trip.
export const queueRanksResource = pointQueryResourceDescriptor<QueueRankRow>(
  "queue-ranks",
  QueueRankRowSchema,
  "conversationId",
);
