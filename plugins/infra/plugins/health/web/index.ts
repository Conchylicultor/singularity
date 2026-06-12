import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Core } from "@plugins/framework/plugins/web-sdk/core";
import { ActionBar } from "@plugins/shell/plugins/action-bar/web";
import { HealthDot } from "./components/health-dot";
import { ReconnectWatcher } from "./components/reconnect-watcher";
import { WedgeWatchdog } from "./components/wedge-watchdog";

export { getHealth, waitForRestart } from "./internal/client";

export default {
  description: "Surfaces server restarts as a toast; exposes /api/health helpers.",
  contributions: [
    Core.Root({ component: ReconnectWatcher }),
    Core.Root({ component: WedgeWatchdog }),
    ActionBar.Item({ id: "health-dot", component: HealthDot }),
  ],
} satisfies PluginDefinition;
