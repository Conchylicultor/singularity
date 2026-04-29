import { getTableColumns, sql } from "drizzle-orm";
import { pgView } from "drizzle-orm/pg-core";
import { _agents } from "./tables";

// Derived view + Zod schemas + types. Tables live in `./tables.ts`.
// Pure Zod schemas are defined in `../../shared/schemas.ts` so they can be
// consumed by shared/ and web/ without pulling drizzle into the bundle.

export {
  AgentSchema,
  AgentLaunchSchema,
  AgentLaunchWithStatusSchema,
} from "../../shared/schemas";
export type {
  Agent,
  AgentLaunch,
  AgentLaunchWithStatus,
} from "../../shared/schemas";

export const agents = pgView("agents_v").as((qb) =>
  qb
    .select({
      ...getTableColumns(_agents),
      isFolder: sql<boolean>`(${_agents.prompt} IS NULL)`.as("is_folder"),
    })
    .from(_agents),
);
