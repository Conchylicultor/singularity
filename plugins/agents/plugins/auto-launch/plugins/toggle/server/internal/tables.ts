import { boolean } from "drizzle-orm/pg-core";
import { _agents } from "@plugins/agents/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";

export const _agentAutoLaunchExt = defineExtension(_agents, "auto_launch", {
  enabled: boolean("enabled").notNull().default(false),
});
