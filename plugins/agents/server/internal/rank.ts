import { nextRankUnder } from "@plugins/primitives/plugins/rank/server";
import { _agents } from "./tables";

export async function nextAgentRankUnder(parentId: string | null): Promise<string> {
  return nextRankUnder(_agents, _agents.parentId, parentId);
}
