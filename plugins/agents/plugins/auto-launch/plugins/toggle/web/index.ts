import type { PluginDefinition } from "@core";
import { Agents } from "@plugins/agents/web";
import { AutoLaunchToggle } from "./components/auto-launch-toggle";

export default {
  id: "agents-auto-launch-toggle",
  name: "Agents: Auto-Launch Toggle",
  description:
    "Toggle on/off to activate agent auto-launch. Placeholder — wiring to schema TBD.",
  contributions: [
    Agents.AgentActions({ id: "auto-launch", component: AutoLaunchToggle }),
  ],
} satisfies PluginDefinition;
