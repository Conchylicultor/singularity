import type { ServerPluginDefinition } from "./types";
import logsPlugin from "@plugins/debug/plugins/logs/server";
import buildPlugin from "@plugins/build/server";
import terminalPlugin from "@plugins/terminal/server";
import tasksCorePlugin from "@plugins/tasks-core/server";
import conversationsPlugin from "@plugins/conversations/server";
import conversationsRuntimeTmuxPlugin from "@plugins/conversations/plugins/runtime-tmux/server";
import conversationsRuntimeApiPlugin from "@plugins/conversations/plugins/runtime-api/server";
import conversationCodePlugin from "@plugins/conversations/plugins/conversation-view/plugins/code/server";
import pushAndExitPlugin from "@plugins/conversations/plugins/conversation-view/plugins/push-and-exit/server";
import dropAndExitPlugin from "@plugins/conversations/plugins/conversation-view/plugins/drop-and-exit/server";
import healthPlugin from "@plugins/health/server";
import mcpPlugin from "@plugins/mcp/server";
import statsCommitsPlugin from "@plugins/stats/plugins/commits/server";
import statsTasksPlugin from "@plugins/stats/plugins/tasks/server";
import tasksPlugin from "@plugins/tasks/server";
import agentsPlugin from "@plugins/agents/server";
import screenshotPlugin from "@plugins/screenshot/server";
import configPlugin from "@plugins/config/server";
import dbBackupPlugin from "@plugins/debug/plugins/db-backup/server";

// Runtime plugins must load before `conversationsPlugin` so they register
// with the `Runtime` registry before the poller starts ticking on its import.
// `mcpPlugin` must load before any plugin that registers an MCP tool (e.g.
// `tasksPlugin`) so the tool registry is importable at that plugin's module
// load time.
export const plugins: ServerPluginDefinition[] = [
  logsPlugin,
  buildPlugin,
  terminalPlugin,
  tasksCorePlugin,
  conversationsRuntimeTmuxPlugin,
  conversationsRuntimeApiPlugin,
  conversationsPlugin,
  conversationCodePlugin,
  pushAndExitPlugin,
  dropAndExitPlugin,
  healthPlugin,
  mcpPlugin,
  configPlugin,
  statsCommitsPlugin,
  statsTasksPlugin,
  tasksPlugin,
  agentsPlugin,
  screenshotPlugin,
  dbBackupPlugin,
];
