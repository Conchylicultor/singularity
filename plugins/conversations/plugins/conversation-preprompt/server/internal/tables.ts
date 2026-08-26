import { text } from "drizzle-orm/pg-core";
import { parsedJson } from "@plugins/database/plugins/sql-column/server";
import { _conversations } from "@plugins/tasks/plugins/tasks-core/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";
import { AvatarSpecSchema } from "../../shared/schemas";

// Snapshot of the task's selected preprompt at conversation-launch time. The
// title, text, and icon are copied (not just the id) so the chip reflects
// exactly what the agent was launched with, even if the config item later
// changes or is deleted. The body column is named `prompt_text` to avoid any
// ambiguity with the SQL `text` type, but the TS field stays `text`. `icon`
// holds the chosen avatar spec (icon key + color + rendered svg nodes), or
// null when the preprompt has no icon.
export const conversationPreprompt = defineExtension(
  _conversations,
  "preprompt",
  {
    prepromptId: text("preprompt_id").notNull(),
    title: text("title").notNull(),
    text: text("prompt_text").notNull(),
    icon: parsedJson("icon", AvatarSpecSchema),
  },
);
// Re-export the underlying pgTable so drizzle-kit's schema glob picks it up.
export const _conversationPrepromptTable = conversationPreprompt.table;
