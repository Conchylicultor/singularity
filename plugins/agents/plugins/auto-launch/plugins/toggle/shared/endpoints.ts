import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const SetAgentAutoLaunchBodySchema = z.object({
  enabled: z.boolean(),
});
export type SetAgentAutoLaunchBody = z.infer<typeof SetAgentAutoLaunchBodySchema>;

export const setAgentAutoLaunch = defineEndpoint({
  route: "POST /api/agent-auto-launch/:agentId",
  body: SetAgentAutoLaunchBodySchema,
});
