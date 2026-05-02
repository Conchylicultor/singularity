import type { PluginDefinition } from "@core";
import { Core } from "@core";
import { Shell } from "@plugins/shell/web";
import { HealthDot } from "./components/health-dot";
import { ReconnectWatcher } from "./components/reconnect-watcher";

export { getHealth, waitForRestart } from "./internal/client";

export default {
  id: "health",
  name: "Health",
  description: "Surfaces server restarts as a toast; exposes /api/health helpers.",
  contributions: [
    Core.Root({ component: ReconnectWatcher }),
    Shell.Toolbar({ id: "health-dot", component: HealthDot, group: "actions" }),
  ],
} satisfies PluginDefinition;
