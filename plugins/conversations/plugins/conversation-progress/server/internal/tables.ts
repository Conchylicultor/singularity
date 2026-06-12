import { text } from "drizzle-orm/pg-core";
import { _conversations } from "@plugins/tasks/plugins/tasks-core/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";

export const conversationProgress = defineExtension(_conversations, "progress", {
  phase: text("phase", {
    enum: ["research", "design", "implementation", "pushed"],
  }).notNull(),
  source: text("source", { enum: ["heuristic", "push"] }).notNull(),
});
// Re-export the underlying pgTable so drizzle-kit's schema glob picks it up.
export const _conversationProgressTable = conversationProgress.table;
