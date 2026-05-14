import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Agents } from "@plugins/agents/web";
import { AutoLaunchToggle } from "./components/auto-launch-toggle";

export default {
  id: "agents-auto-launch-toggle",
  name: "Agents: Auto-Launch Toggle",
  description:
    "Toggle on/off to activate agent auto-launch. Owns the agents_ext_auto_launch side-table via the entity-extensions primitive.",
  contributions: [
    Agents.AgentActions({ id: "auto-launch", component: AutoLaunchToggle }),
  ],
} satisfies PluginDefinition;
