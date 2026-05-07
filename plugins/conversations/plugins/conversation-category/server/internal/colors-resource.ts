import { db } from "@plugins/database/server";
import { defineResource } from "@server/resources";
import { z } from "zod";
import { _conversationCategoryColors } from "./tables-colors";

export const categoryColorsResource = defineResource<Record<string, string>>({
  key: "conversation-category-colors",
  mode: "push",
  schema: z.record(z.string()),
  loader: async () => {
    const rows = await db.select().from(_conversationCategoryColors);
    return Object.fromEntries(rows.map((r) => [r.category, r.colorKey]));
  },
});
