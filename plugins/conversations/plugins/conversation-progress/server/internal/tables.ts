import { _conversations } from "@plugins/tasks/plugins/tasks-core/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";
import { parsedText } from "@plugins/database/plugins/sql-column/server";
import {
  ProgressPhaseSchema,
  ProgressSourceSchema,
} from "../../shared/schemas";

export const conversationProgress = defineExtension(
  _conversations,
  "progress",
  {
    phase: parsedText("phase", ProgressPhaseSchema).notNull(),
    source: parsedText("source", ProgressSourceSchema).notNull(),
  },
);
// Re-export the underlying pgTable so drizzle-kit's schema glob picks it up.
export const _conversationProgressTable = conversationProgress.table;
