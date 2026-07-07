import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { WebsiteAgents } from "@plugins/apps/plugins/website/plugins/pillars/plugins/agents/web";
import { AgentRunSection } from "./components/agent-run";

export default {
  description:
    "Agent-run simulator on the public site's Agents page: a fake task list where the visitor launches agents and watches each race through worktree → edit → build → merge, several concurrently — a deterministic, client-only replay of the real loop.",
  contributions: [
    WebsiteAgents.Section({
      id: "agent-run",
      label: "Agent run demo",
      component: AgentRunSection,
    }),
  ],
} satisfies PluginDefinition;
