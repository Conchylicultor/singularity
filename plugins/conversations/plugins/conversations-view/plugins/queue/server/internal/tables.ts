import { rankText } from "@plugins/primitives/plugins/rank/core";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";
import { _conversations } from "@plugins/tasks/plugins/tasks-core/server";
import { boolean } from "drizzle-orm/pg-core";

// The queue row of a conversation: its position (`rank`) and whether the user
// pinned it. The pin sits on the SAME row as the rank — it is a plain per-row
// flag the user sets, not derived state that has to be recomputed as
// conversations change status, so it needs neither a singleton table nor a
// resource of its own.
export const conversationsQueue = defineExtension(_conversations, "queue", {
  rank: rankText("rank").notNull(),
  pinned: boolean("pinned").notNull().default(false),
});
// Re-export the underlying pgTable so drizzle-kit's schema glob picks it up.
export const _conversationsQueueTable = conversationsQueue.table;
