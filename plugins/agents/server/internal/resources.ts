import { asc } from "drizzle-orm";
import { db } from "../../../../server/src/db/client";
import { defineResource } from "../../../../server/src/resources";
import { _agent_launches } from "../schema_internal";
import { agents, type Agent, type AgentLaunch } from "../schema";

export const agentsResource = defineResource({
  key: "agents",
  mode: "push",
  loader: async (): Promise<Agent[]> =>
    db.select().from(agents).orderBy(asc(agents.rank), asc(agents.createdAt)),
});

export const agentLaunchesResource = defineResource({
  key: "agent-launches",
  mode: "push",
  loader: async (): Promise<AgentLaunch[]> =>
    db.select().from(_agent_launches).orderBy(asc(_agent_launches.createdAt)),
});
