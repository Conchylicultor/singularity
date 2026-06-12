import { nextRankUnder } from "@plugins/primitives/plugins/rank/server";
import type { Rank } from "@plugins/primitives/plugins/rank/core";
import { _agents } from "./tables";

export async function nextAgentRankUnder(parentId: string | null): Promise<Rank> {
  return nextRankUnder(_agents, _agents.parentId, parentId);
}
