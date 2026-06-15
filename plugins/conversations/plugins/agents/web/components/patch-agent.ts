import type { Rank } from "@plugins/primitives/plugins/rank/core";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { updateAgent } from "@plugins/conversations/plugins/agents/core";

type AgentPatch = {
  name?: string;
  expanded?: boolean;
  parentId?: string | null;
  rank?: Rank;
};

export async function patchAgent(id: string, patch: AgentPatch) {
  await fetchEndpoint(updateAgent, { id }, { body: patch });
}
