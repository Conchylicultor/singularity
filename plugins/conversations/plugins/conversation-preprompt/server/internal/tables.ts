import { text } from "drizzle-orm/pg-core";
import { _conversations } from "@plugins/tasks-core/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";

// Snapshot of the task's selected preprompt at conversation-launch time. The
// title and text are copied (not just the id) so the chip reflects exactly
// what the agent was launched with, even if the config item later changes or
// is deleted. The body column is named `prompt_text` to avoid any ambiguity
// with the SQL `text` type, but the TS field stays `text`.
export const conversationPreprompt = defineExtension(_conversations, "preprompt", {
  prepromptId: text("preprompt_id").notNull(),
  title: text("title").notNull(),
  text: text("prompt_text").notNull(),
});
// Re-export the underlying pgTable so drizzle-kit's schema glob picks it up.
export const _conversationPrepromptTable = conversationPreprompt.table;
