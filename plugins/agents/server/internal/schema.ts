import { getTableColumns, sql } from "drizzle-orm";
import { pgView } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { _agent_launches, _agents } from "./tables";

// Derived view + Zod schemas + types. Tables live in `./tables.ts`.

export const agents = pgView("agents_v").as((qb) =>
  qb
    .select({
      ...getTableColumns(_agents),
      isFolder: sql<boolean>`(${_agents.prompt} IS NULL)`.as("is_folder"),
    })
    .from(_agents),
);

export const AgentSchema = createSelectSchema(_agents, {
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
}).extend({
  isFolder: z.boolean(),
});
export type Agent = z.infer<typeof AgentSchema>;

export const AgentLaunchSchema = createSelectSchema(_agent_launches, {
  createdAt: z.coerce.date(),
});
export type AgentLaunch = z.infer<typeof AgentLaunchSchema>;
