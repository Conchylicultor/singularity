import { nextRankUnder, rankAfterSibling } from "@plugins/primitives/plugins/rank/server";
import type { Rank } from "@plugins/primitives/plugins/rank/core";
import { _agents } from "./tables";

export async function nextAgentRankUnder(parentId: string | null): Promise<Rank> {
  return nextRankUnder(_agents, _agents.parentId, parentId);
}

// Positional insert: place the new agent right after `afterId` among its true
// siblings. Throws if the anchor isn't a sibling — the client sent a stale id.
export async function agentRankAfterSibling(
  parentId: string | null,
  afterId: string,
): Promise<Rank> {
  return rankAfterSibling(_agents, _agents.parentId, parentId, afterId, _agents.id);
}
