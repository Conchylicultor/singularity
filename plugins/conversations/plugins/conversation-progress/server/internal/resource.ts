import { asc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { conversationProgressResource as conversationProgressDescriptor } from "../../shared/schemas";
import { conversationProgress } from "./tables";

export const conversationProgressResource = defineResource(conversationProgressDescriptor, {
  mode: "push",
  loader: async () => {
    return db
      .select({
        conversationId: conversationProgress.table.parentId,
        phase: conversationProgress.table.phase,
        source: conversationProgress.table.source,
        updatedAt: conversationProgress.table.updatedAt,
      })
      .from(conversationProgress.table)
      .orderBy(asc(conversationProgress.table.parentId));
  },
});
