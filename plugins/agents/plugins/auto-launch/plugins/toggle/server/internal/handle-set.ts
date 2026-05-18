import { implement } from "@plugins/infra/plugins/endpoints/server";
import { setAgentAutoLaunch } from "../../shared/endpoints";
import { agentAutoLaunchResource } from "./resource";
import { agentAutoLaunch } from "./tables";

export const handleSet = implement(setAgentAutoLaunch, async ({ params, body }) => {
  const row = await agentAutoLaunch.upsert(params.agentId, { enabled: body.enabled });
  agentAutoLaunchResource.notify();
  return row;
});
