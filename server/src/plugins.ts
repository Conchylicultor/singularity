import type { ServerPluginDefinition } from "./types";
import logsPlugin from "@plugins/logs/server";
import buildPlugin from "@plugins/build/server";
import terminalPlugin from "@plugins/terminal/server";
import conversationsPlugin from "@plugins/conversations/server";
import dbSmoketestPlugin from "@plugins/db-smoketest/server";

export const plugins: ServerPluginDefinition[] = [
  logsPlugin,
  buildPlugin,
  terminalPlugin,
  conversationsPlugin,
  dbSmoketestPlugin,
];
