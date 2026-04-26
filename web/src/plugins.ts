import type { PluginDefinition } from "@core";
import shellPlugin from "@plugins/shell/web";
import panePlugin from "@plugins/pane/web";
import terminalPlugin from "@plugins/terminal/web";
import buildPlugin from "@plugins/build/web";
import debugPlugin from "@plugins/debug/web";
import dbBackupPlugin from "@plugins/debug/plugins/db-backup/web";
import logsPlugin from "@plugins/debug/plugins/logs/web";
import worktreeCleanupPlugin from "@plugins/debug/plugins/worktree-cleanup/web";
import queuePlugin from "@plugins/debug/plugins/queue/web";
import conversationsPlugin from "@plugins/conversations/plugins/conversations-view/web";
import conversationPlugin from "@plugins/conversations/plugins/conversation-view/web";
import conversationVscodePlugin from "@plugins/conversations/plugins/conversation-view/plugins/vscode/web";
import conversationOpenAppPlugin from "@plugins/conversations/plugins/conversation-view/plugins/open-app/web";
import conversationStatusPlugin from "@plugins/conversations/plugins/conversation-view/plugins/status/web";
import conversationModelPlugin from "@plugins/conversations/plugins/conversation-view/plugins/model/web";
import conversationTitlePlugin from "@plugins/conversations/plugins/conversation-view/plugins/title/web";
import conversationTasksPanelPlugin from "@plugins/conversations/plugins/conversation-view/plugins/tasks-panel/web";
import conversationJsonlViewerPlugin from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import conversationJsonlViewerUserTextPlugin from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/user-text/web";
import conversationJsonlViewerAssistantTextPlugin from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/assistant-text/web";
import conversationJsonlViewerAssistantToolUsePlugin from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/assistant-tool-use/web";
import conversationJsonlViewerUserToolResultPlugin from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/user-tool-result/web";
import conversationJsonlViewerSystemPlugin from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/system/web";
import conversationJsonlViewerSummaryPlugin from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/summary/web";
import conversationPushAndExitPlugin from "@plugins/conversations/plugins/conversation-view/plugins/push-and-exit/web";
import conversationDropAndExitPlugin from "@plugins/conversations/plugins/conversation-view/plugins/drop-and-exit/web";
import conversationHoldAndExitPlugin from "@plugins/conversations/plugins/conversation-view/plugins/hold-and-exit/web";
import conversationExitPlugin from "@plugins/conversations/plugins/conversation-view/plugins/exit/web";
import conversationResumePlugin from "@plugins/conversations/plugins/conversation-view/plugins/resume/web";
import conversationQuickPromptsPlugin from "@plugins/conversations/plugins/conversation-view/plugins/quick-prompts/web";
import conversationForkPlugin from "@plugins/conversations/plugins/conversation-view/plugins/fork-conversation/web";
import conversationForkSessionPlugin from "@plugins/conversations/plugins/conversation-view/plugins/fork-session/web";
import conversationPromptInputPlugin from "@plugins/conversations/plugins/conversation-view/plugins/prompt-input/web";
import conversationCodePlugin from "@plugins/conversations/plugins/conversation-view/plugins/code/web";
import conversationCodeDocsButtonPlugin from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/docs-button/web";
import conversationCodeReviewPlugin from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/review/web";
import conversationCodeFilePaneRawPlugin from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/plugins/raw/web";
import conversationCodeFilePaneMarkdownPlugin from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/plugins/markdown/web";
import conversationCodeFilePaneDiffPlugin from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/plugins/diff/web";
import conversationCodeFilePaneImagePlugin from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/plugins/image/web";
import codeExplorerPlugin from "@plugins/code-explorer/web";
import worktreeSwitcherPlugin from "@plugins/worktree-switcher/web";
import themePlugin from "@plugins/theme/web";
import welcomePlugin from "@plugins/welcome/web";
import launchPlugin from "@plugins/launch/web";
import treePlugin from "@plugins/tree/web";
import healthPlugin from "@plugins/health/web";
import crashesPlugin from "@plugins/crashes/web";
import statsPlugin from "@plugins/stats/web";
import statsCommitsPlugin from "@plugins/stats/plugins/commits/web";
import statsTasksPlugin from "@plugins/stats/plugins/tasks/web";
import tasksPlugin from "@plugins/tasks/web";
import agentsPlugin from "@plugins/agents/web";
import screenshotPlugin from "@plugins/screenshot/web";
import attachmentsPlugin from "@plugins/attachments/web";
import improvePlugin from "@plugins/improve/web";
import configPlugin from "@plugins/config/web";
import eventsTestPlugin from "@plugins/events-test/web";
import conversationsRecoverPlugin from "@plugins/conversations-recover/web";
import attemptViewPlugin from "@plugins/attempt-view/web";
import yakShavingPlugin from "@plugins/yak-shaving/web";
import authPlugin from "@plugins/auth/web";
import authGooglePlugin from "@plugins/auth/plugins/google/web";
import authNotionPlugin from "@plugins/auth/plugins/notion/web";

export const plugins: PluginDefinition[] = [
  shellPlugin,
  panePlugin,
  welcomePlugin,
  launchPlugin,
  treePlugin,
  terminalPlugin,
  worktreeSwitcherPlugin,
  buildPlugin,
  debugPlugin,
  logsPlugin,
  dbBackupPlugin,
  worktreeCleanupPlugin,
  queuePlugin,
  conversationPlugin,
  conversationVscodePlugin,
  conversationOpenAppPlugin,
  conversationStatusPlugin,
  conversationModelPlugin,
  conversationTitlePlugin,
  conversationTasksPanelPlugin,
  conversationJsonlViewerPlugin,
  conversationJsonlViewerUserTextPlugin,
  conversationJsonlViewerAssistantTextPlugin,
  conversationJsonlViewerAssistantToolUsePlugin,
  conversationJsonlViewerUserToolResultPlugin,
  conversationJsonlViewerSystemPlugin,
  conversationJsonlViewerSummaryPlugin,
  conversationQuickPromptsPlugin,
  conversationForkPlugin,
  conversationForkSessionPlugin,
  conversationPromptInputPlugin,
  conversationPushAndExitPlugin,
  conversationDropAndExitPlugin,
  conversationHoldAndExitPlugin,
  conversationExitPlugin,
  conversationResumePlugin,
  conversationCodePlugin,
  conversationCodeDocsButtonPlugin,
  conversationCodeReviewPlugin,
  conversationCodeFilePaneRawPlugin,
  conversationCodeFilePaneMarkdownPlugin,
  conversationCodeFilePaneDiffPlugin,
  conversationCodeFilePaneImagePlugin,
  codeExplorerPlugin,
  conversationsPlugin,
  themePlugin,
  healthPlugin,
  crashesPlugin,
  statsPlugin,
  statsTasksPlugin,
  statsCommitsPlugin,
  tasksPlugin,
  agentsPlugin,
  screenshotPlugin,
  attachmentsPlugin,
  improvePlugin,
  configPlugin,
  eventsTestPlugin,
  conversationsRecoverPlugin,
  attemptViewPlugin,
  yakShavingPlugin,
  authPlugin,
  authGooglePlugin,
  authNotionPlugin,
];
