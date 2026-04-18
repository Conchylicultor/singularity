import type { Agent, AgentLaunch } from "../server/schema";

function descriptor<T>(key: string) {
  return { key } as {
    readonly key: string;
    readonly __types?: { value: T; params: Record<string, never> };
  };
}

export const agentsResource = descriptor<Agent[]>("agents");
export const agentLaunchesResource = descriptor<AgentLaunch[]>("agent-launches");
