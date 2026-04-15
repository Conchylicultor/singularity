import { desc } from "drizzle-orm";
import { db } from "../../../../server/src/db/client";
import { defineResource } from "../../../../server/src/resources";
import { conversations, isActiveStatus } from "../schema";
import type { ConversationEntry } from "../../shared/resources";
import { getSnapshot } from "./poller";

// Single live-state resource: the full conversations list, including each
// row's runtime `working` flag. Clients derive per-id views by filtering.
export const conversationsResource = defineResource({
  key: "conversations",
  mode: "push",
  loader: async (): Promise<ConversationEntry[]> => {
    const rows = await db
      .select()
      .from(conversations)
      .orderBy(desc(conversations.createdAt));
    const snap = getSnapshot();
    return rows.map((r) => ({
      ...r,
      active: isActiveStatus(r.status),
      working: snap.get(r.id)?.working ?? false,
    }));
  },
});
