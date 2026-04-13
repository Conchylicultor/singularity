import type { ServerPluginDefinition } from "./types";
import logsPlugin from "@plugins/logs/server";
import buildPlugin from "@plugins/build/server";
import terminalPlugin from "@plugins/terminal/server";
import conversationsPlugin from "@plugins/conversations/server";
import healthPlugin from "@plugins/health/server";
import statsCommitsPlugin from "@plugins/stats/plugins/commits/server";

export const plugins: ServerPluginDefinition[] = [
  logsPlugin,
  buildPlugin,
  terminalPlugin,
  conversationsPlugin,
  healthPlugin,
  statsCommitsPlugin,
];
