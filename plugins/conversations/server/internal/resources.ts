import { desc } from "drizzle-orm";
import { db } from "../../../../server/src/db/client";
import { defineResource } from "../../../../server/src/resources";
import { conversations } from "./schema";
import type { ConversationEntry } from "../../shared/resources";

export const conversationsResource = defineResource({
  key: "conversations",
  mode: "push",
  loader: async (): Promise<ConversationEntry[]> =>
    db.select().from(conversations).orderBy(desc(conversations.createdAt)),
});
