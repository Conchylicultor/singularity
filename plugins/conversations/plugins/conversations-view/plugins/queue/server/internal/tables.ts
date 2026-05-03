import { rankText } from "@server/db/types";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";
import { _conversations } from "@plugins/tasks-core/server";

export const _conversationsExtQueue = defineExtension(_conversations, "queue", {
  rank: rankText("rank").notNull(),
});
