import { z } from "zod";
import { db } from "@server/db/client";
import { defineResource } from "@server/resources";
import {
  AgentAutoLaunchRowSchema,
  type AgentAutoLaunchRow,
} from "../../shared/resources";
import { _agentAutoLaunchExt } from "./tables";

export const agentAutoLaunchResource = defineResource({
  key: "agent-auto-launch",
  mode: "push",
  schema: z.array(AgentAutoLaunchRowSchema),
  loader: async (): Promise<AgentAutoLaunchRow[]> => {
    const rows = await db.select().from(_agentAutoLaunchExt);
    return rows.map((r) => ({ parentId: r.parentId, enabled: r.enabled }));
  },
});
