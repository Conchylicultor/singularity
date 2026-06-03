import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ErrorBoundary } from "@plugins/primitives/plugins/error-boundary/web";
import { LaunchFixButton } from "./components/launch-fix-button";

export default {
  name: "Crashes: Launch fix agent",
  description:
    "Adds a Fix button to the plugin crash banner that launches an agent on the auto-created crash task with optional freeform context.",
  contributions: [ErrorBoundary.Action({ component: LaunchFixButton })],
} satisfies PluginDefinition;
