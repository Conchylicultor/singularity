import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@server/resources";
import {
  AgentAutoLaunchRowSchema,
  type AgentAutoLaunchRow,
} from "@plugins/agents/plugins/auto-launch/plugins/toggle/shared/resources";
import { agentAutoLaunch } from "./tables";

export const agentAutoLaunchResource = defineResource({
  key: "agent-auto-launch",
  mode: "push",
  schema: z.array(AgentAutoLaunchRowSchema),
  loader: async (): Promise<AgentAutoLaunchRow[]> => {
    const rows = await db.select().from(agentAutoLaunch.table);
    return rows.map((r) => ({ parentId: r.parentId, enabled: r.enabled }));
  },
});
