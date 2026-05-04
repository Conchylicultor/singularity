import { boolean } from "drizzle-orm/pg-core";
import { _agents } from "@plugins/agents/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";

export const agentAutoLaunch = defineExtension(_agents, "auto_launch", {
  enabled: boolean("enabled").notNull().default(false),
});
// Re-export the underlying pgTable so drizzle-kit's schema glob picks it up.
export const _agentAutoLaunchTable = agentAutoLaunch.table;
