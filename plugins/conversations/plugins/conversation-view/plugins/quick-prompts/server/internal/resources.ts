import { asc } from "drizzle-orm";
import { db } from "@server/db/client";
import { defineResource } from "@server/resources";
import { quickPromptsTable } from "./tables";
import type { QuickPrompt } from "../../shared/resources";

export const quickPromptsServerResource = defineResource<QuickPrompt[]>({
  key: "quick-prompts",
  mode: "push",
  async loader() {
    return db
      .select()
      .from(quickPromptsTable)
      .orderBy(asc(quickPromptsTable.rank), asc(quickPromptsTable.createdAt));
  },
});
