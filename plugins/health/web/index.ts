import type { PluginDefinition } from "@core";
import { Core } from "@core";
import { ReconnectWatcher } from "./components/reconnect-watcher";

export { getHealth, waitForRestart } from "./internal/api";

export default {
  id: "health",
  name: "Health",
  description: "Surfaces server restarts as a toast; exposes /api/health helpers.",
  contributions: [Core.Root({ component: ReconnectWatcher })],
} satisfies PluginDefinition;
