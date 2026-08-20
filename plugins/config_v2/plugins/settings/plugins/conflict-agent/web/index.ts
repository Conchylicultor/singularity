import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigDetailSlots } from "@plugins/config_v2/plugins/settings/web";
import { ConflictAgentButton } from "./components/conflict-agent-button";

export default {
  description:
    "Ask-an-agent button inside the config detail's conflict banners: opens the standard task-draft popover pre-filled with a factual description of the conflict (which fields disagree, and how).",
  contributions: [
    ConfigDetailSlots.ConflictAction({
      id: "conflict-agent",
      component: ConflictAgentButton,
    }),
  ],
} satisfies PluginDefinition;
