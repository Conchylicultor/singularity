import type { ServerPluginDefinition } from "./types";
import logsPlugin from "@plugins/debug/plugins/logs/server";
import buildPlugin from "@plugins/build/server";
import terminalPlugin from "@plugins/terminal/server";
import tasksCorePlugin from "@plugins/tasks-core/server";
import conversationsPlugin from "@plugins/conversations/server";
import conversationsRuntimeTmuxPlugin from "@plugins/conversations/plugins/runtime-tmux/server";
import conversationsRuntimeApiPlugin from "@plugins/conversations/plugins/runtime-api/server";
import conversationCodePlugin from "@plugins/conversations/plugins/conversation-view/plugins/code/server";
import codeExplorerPlugin from "@plugins/code-explorer/server";
import pushAndExitPlugin from "@plugins/conversations/plugins/conversation-view/plugins/push-and-exit/server";
import dropAndExitPlugin from "@plugins/conversations/plugins/conversation-view/plugins/drop-and-exit/server";
import holdAndExitPlugin from "@plugins/conversations/plugins/conversation-view/plugins/hold-and-exit/server";
import exitPlugin from "@plugins/conversations/plugins/conversation-view/plugins/exit/server";
import resumePlugin from "@plugins/conversations/plugins/conversation-view/plugins/resume/server";
import quickPromptsPlugin from "@plugins/conversations/plugins/conversation-view/plugins/quick-prompts/server";
import jsonlViewerPlugin from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/server";
import conversationCodeReviewPlugin from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/review/server";
import healthPlugin from "@plugins/health/server";
import mcpPlugin from "@plugins/mcp/server";
import statsCommitsPlugin from "@plugins/stats/plugins/commits/server";
import statsTasksPlugin from "@plugins/stats/plugins/tasks/server";
import tasksPlugin from "@plugins/tasks/server";
import agentsPlugin from "@plugins/agents/server";
import screenshotPlugin from "@plugins/screenshot/server";
import attachmentsPlugin from "@plugins/attachments/server";
import improvePlugin from "@plugins/improve/server";
import configPlugin from "@plugins/config/server";
import crashesPlugin from "@plugins/crashes/server";
import dbBackupPlugin from "@plugins/debug/plugins/db-backup/server";
import worktreeCleanupPlugin from "@plugins/debug/plugins/worktree-cleanup/server";
import jobsPlugin from "@plugins/jobs/server";
import eventsPlugin from "@plugins/events/server";
import secretsPlugin from "@plugins/secrets/server";
import eventsTestPlugin from "@plugins/events-test/server";
import conversationsRecoverPlugin from "@plugins/conversations-recover/server";
import yakShavingPlugin from "@plugins/yak-shaving/server";
import authPlugin from "@plugins/auth/server";
import authGooglePlugin from "@plugins/auth/plugins/google/server";
import authNotionPlugin from "@plugins/auth/plugins/notion/server";

// Runtime plugins must load before `conversationsPlugin` so they register
// with the `Runtime` registry before the poller starts ticking on its import.
// `mcpPlugin` must load before any plugin that registers an MCP tool (e.g.
// `tasksPlugin`) so the tool registry is importable at that plugin's module
// load time.
export const plugins: ServerPluginDefinition[] = [
  logsPlugin,
  crashesPlugin,
  buildPlugin,
  terminalPlugin,
  tasksCorePlugin,
  conversationsRuntimeTmuxPlugin,
  conversationsRuntimeApiPlugin,
  conversationsPlugin,
  conversationCodePlugin,
  codeExplorerPlugin,
  pushAndExitPlugin,
  dropAndExitPlugin,
  holdAndExitPlugin,
  exitPlugin,
  resumePlugin,
  quickPromptsPlugin,
  jsonlViewerPlugin,
  conversationCodeReviewPlugin,
  healthPlugin,
  mcpPlugin,
  configPlugin,
  statsCommitsPlugin,
  statsTasksPlugin,
  tasksPlugin,
  agentsPlugin,
  screenshotPlugin,
  attachmentsPlugin,
  improvePlugin,
  dbBackupPlugin,
  worktreeCleanupPlugin,
  // Jobs plugin owns the graphile-worker lifecycle; must load before the
  // events plugin (which enqueues a dispatcher job at module load) and any
  // plugin that calls `defineJob`.
  jobsPlugin,
  // Events plugin layers event→job bindings on top of jobs. Must load before
  // any plugin that defines events, so the `defineTriggerEvent` factory is
  // ready when their tables.ts files execute.
  eventsPlugin,
  eventsTestPlugin,
  conversationsRecoverPlugin,
  yakShavingPlugin,
  // Secrets primitive: encrypted key-value store on main, unix-socket RPC for
  // worktrees. Consumed by auth (tokens) and config (secret fields). Load order
  // doesn't matter because onReady runs in parallel; consumers coordinate via
  // the exported `ready` promise.
  secretsPlugin,
  // Auth plugin must load before its provider sub-plugins because the providers'
  // module bodies call `registerAuthProvider`. Both load via the same plugin
  // graph anyway (TS module init runs once per import); the order here only
  // affects the `onReady` sequence, which is independent.
  authPlugin,
  authGooglePlugin,
  authNotionPlugin,
];
