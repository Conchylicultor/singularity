import type { PluginDefinition } from "@core";
import { Core } from "@core";
import { LaunchFixButton } from "./components/launch-fix-button";

export default {
  id: "crashes-launch-fix",
  name: "Crashes: Launch fix agent",
  description:
    "Adds a Fix button to the plugin crash banner that launches an agent on the auto-created crash task with optional freeform context.",
  contributions: [Core.CrashAction({ component: LaunchFixButton })],
} satisfies PluginDefinition;
