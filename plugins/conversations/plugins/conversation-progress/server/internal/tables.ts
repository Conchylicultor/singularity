import { text } from "drizzle-orm/pg-core";
import { _conversations } from "@plugins/tasks-core/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";

export const _conversationProgress = defineExtension(_conversations, "progress", {
  phase: text("phase", {
    enum: ["research", "design", "implementation", "pushed"],
  }).notNull(),
  source: text("source", { enum: ["heuristic", "push"] }).notNull(),
});
