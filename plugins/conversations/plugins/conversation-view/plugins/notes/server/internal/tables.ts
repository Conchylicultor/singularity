import { text } from "drizzle-orm/pg-core";
import { _conversations } from "@plugins/tasks/plugins/tasks-core/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";

export const conversationNotes = defineExtension(_conversations, "notes", {
  notes: text("notes").notNull(),
});
export const _conversationNotesTable = conversationNotes.table;
