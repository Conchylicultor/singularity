import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { z } from "zod";

export const AgentAutoLaunchRowSchema = z.object({
  parentId: z.string(),
  enabled: z.boolean(),
});
export type AgentAutoLaunchRow = z.infer<typeof AgentAutoLaunchRowSchema>;

export const agentAutoLaunchResource = resourceDescriptor<AgentAutoLaunchRow[]>(
  "agent-auto-launch",
  z.array(AgentAutoLaunchRowSchema),
  [],
);
