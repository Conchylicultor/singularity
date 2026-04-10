import type { ServerPluginDefinition } from "./types";
import logsPlugin from "@plugins/logs/server";
import buildPlugin from "@plugins/build/server";
import terminalPlugin from "@plugins/terminal/server";

export const plugins: ServerPluginDefinition[] = [
  logsPlugin,
  buildPlugin,
  terminalPlugin,
];
