import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Core } from "@plugins/framework/plugins/web-sdk/core";
import { Shell } from "@plugins/shell/web";
import { HealthDot } from "./components/health-dot";
import { ReconnectWatcher } from "./components/reconnect-watcher";

export { getHealth, waitForRestart } from "./internal/client";

export default {
  name: "Health",
  description: "Surfaces server restarts as a toast; exposes /api/health helpers.",
  contributions: [
    Core.Root({ component: ReconnectWatcher }),
    Shell.Toolbar({ id: "health-dot", component: HealthDot, group: "actions" }),
  ],
} satisfies PluginDefinition;
