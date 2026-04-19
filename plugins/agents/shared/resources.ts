// In-plugin imports go straight to the leaf so the frontend bundle doesn't
// pull `server/api`'s runtime surface. Cross-plugin consumers go through
// `@plugins/agents/server/api`.
import type { Agent, AgentLaunch } from "../server/internal/schema";

export type { Agent, AgentLaunch } from "../server/internal/schema";

function descriptor<T>(key: string) {
  return { key } as {
    readonly key: string;
    readonly __types?: { value: T; params: Record<string, never> };
  };
}

export const agentsResource = descriptor<Agent[]>("agents");
export const agentLaunchesResource = descriptor<AgentLaunch[]>("agent-launches");
