import { desc } from "drizzle-orm";
import { db } from "../../../../server/src/db/client";
import { defineResource } from "../../../../server/src/resources";
import { conversations, isActiveStatus } from "../schema";
import type { ConversationEntry } from "../../shared/resources";

export const conversationsResource = defineResource({
  key: "conversations",
  mode: "push",
  loader: async (): Promise<ConversationEntry[]> => {
    const rows = await db
      .select()
      .from(conversations)
      .orderBy(desc(conversations.createdAt));
    return rows.map((r) => ({ ...r, active: isActiveStatus(r.status) }));
  },
});
