import { defineIdKind, type IdOf } from "@plugins/ids/core";

/**
 * The two id kinds this plugin mints — an agent definition (`agents.id`) and
 * one launch of it (`agent_launches.id`) — declared once (`plugins/ids`), so
 * the mint and every reading of the shape derive from here. Rows minted before
 * (`agent-<ms>-<6>`, `launch-<s>-<4>`) stay recognised: recognition is the
 * generic body every kind shares.
 */
export const agentIdKind = defineIdKind({ prefix: "agent", label: "Agent" });

export const agentLaunchIdKind = defineIdKind({
  prefix: "launch",
  label: "Agent launch",
});

export type AgentId = IdOf<typeof agentIdKind>;
export type AgentLaunchId = IdOf<typeof agentLaunchIdKind>;
