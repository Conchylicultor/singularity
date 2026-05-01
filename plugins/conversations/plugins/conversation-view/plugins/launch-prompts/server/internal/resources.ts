import { asc } from "drizzle-orm";
import { db } from "@server/db/client";
import { defineResource } from "@server/resources";
import { launchPromptsTable } from "./tables";
import type { LaunchPrompt } from "../../shared/resources";

export const launchPromptsServerResource = defineResource<LaunchPrompt[]>({
  key: "launch-prompts",
  mode: "push",
  async loader() {
    const rows = await db
      .select({
        id:     launchPromptsTable.id,
        title:  launchPromptsTable.title,
        prompt: launchPromptsTable.prompt,
        model:  launchPromptsTable.model,
        rank:   launchPromptsTable.rank,
      })
      .from(launchPromptsTable)
      .orderBy(asc(launchPromptsTable.rank), asc(launchPromptsTable.createdAt));
    return rows as LaunchPrompt[];
  },
});
