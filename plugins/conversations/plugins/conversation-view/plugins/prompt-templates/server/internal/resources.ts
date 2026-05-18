import { asc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { promptTemplatesTable } from "./tables";
import type { PromptTemplate } from "../../shared/resources";

export const promptTemplatesServerResource = defineResource<PromptTemplate[]>({
  key: "prompt-templates",
  mode: "push",
  async loader() {
    const rows = await db
      .select()
      .from(promptTemplatesTable)
      .orderBy(asc(promptTemplatesTable.rank), asc(promptTemplatesTable.createdAt));
    return rows as unknown as PromptTemplate[];
  },
});
