import { rankText } from "@server/db/types";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";
import { _conversations } from "@plugins/tasks-core/server";

export const conversationsQueue = defineExtension(_conversations, "queue", {
  rank: rankText("rank").notNull(),
});
// Re-export the underlying pgTable so drizzle-kit's schema glob picks it up.
export const _conversationsQueueTable = conversationsQueue.table;
