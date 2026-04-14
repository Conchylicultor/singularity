import type { ServerPluginDefinition } from "./types";
import logsPlugin from "@plugins/logs/server";
import buildPlugin from "@plugins/build/server";
import terminalPlugin from "@plugins/terminal/server";
import conversationsPlugin from "@plugins/conversations/server";
import conversationsRuntimeTmuxPlugin from "@plugins/conversations/plugins/runtime-tmux/server";
import conversationsRuntimeApiPlugin from "@plugins/conversations/plugins/runtime-api/server";
import healthPlugin from "@plugins/health/server";
import statsCommitsPlugin from "@plugins/stats/plugins/commits/server";

// Runtime plugins must load before `conversationsPlugin` so they register
// with the `Runtime` registry before the poller starts ticking on its import.
export const plugins: ServerPluginDefinition[] = [
  logsPlugin,
  buildPlugin,
  terminalPlugin,
  conversationsRuntimeTmuxPlugin,
  conversationsRuntimeApiPlugin,
  conversationsPlugin,
  healthPlugin,
  statsCommitsPlugin,
];
