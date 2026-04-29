import type { PluginDefinition } from "@core";
import shellPlugin from "@plugins/shell/web";
import panePlugin from "@plugins/primitives/plugins/pane/web";
import terminalPlugin from "@plugins/terminal/web";
import buildPlugin from "@plugins/build/web";
import debugPlugin from "@plugins/debug/web";
import dbBackupPlugin from "@plugins/debug/plugins/db-backup/web";
import logsPlugin from "@plugins/debug/plugins/logs/web";
import worktreeCleanupPlugin from "@plugins/debug/plugins/worktree-cleanup/web";
import queuePlugin from "@plugins/debug/plugins/queue/web";
import conversationsPlugin from "@plugins/conversations/plugins/conversations-view/web";
import conversationGroupsPlugin from "@plugins/conversations/plugins/conversation-groups/web";
import conversationPlugin from "@plugins/conversations/plugins/conversation-view/web";
import conversationUiPlugin from "@plugins/conversations/plugins/conversation-ui/web";
import conversationUiItemPlugin from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import conversationVscodePlugin from "@plugins/conversations/plugins/conversation-view/plugins/vscode/web";
import conversationOpenAppPlugin from "@plugins/conversations/plugins/conversation-view/plugins/open-app/web";
import conversationStatusPlugin from "@plugins/conversations/plugins/conversation-view/plugins/status/web";
import conversationModelPlugin from "@plugins/conversations/plugins/conversation-view/plugins/model/web";
import conversationNewChildTaskPlugin from "@plugins/conversations/plugins/conversation-view/plugins/new-child-task/web";
import conversationTasksPanelPlugin from "@plugins/conversations/plugins/conversation-view/plugins/tasks-panel/web";
import conversationTerminalPanePlugin from "@plugins/conversations/plugins/conversation-view/plugins/terminal-pane/web";
import conversationSideConversationPlugin from "@plugins/conversations/plugins/conversation-view/plugins/side-conversation/web";
import conversationJsonlViewerPlugin from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import conversationJsonlViewerUserTextPlugin from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/user-text/web";
import conversationJsonlViewerAssistantTextPlugin from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/assistant-text/web";
import conversationJsonlViewerAssistantToolUsePlugin from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/assistant-tool-use/web";
import conversationJsonlViewerUserToolResultPlugin from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/user-tool-result/web";
import conversationJsonlViewerUserImagePlugin from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/user-image/web";
import conversationJsonlViewerSystemPlugin from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/system/web";
import conversationJsonlViewerSummaryPlugin from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/summary/web";
import conversationPushAndExitPlugin from "@plugins/conversations/plugins/conversation-view/plugins/push-and-exit/web";
import conversationSummaryPlugin from "@plugins/conversations/plugins/summary/web";
import conversationDropAndExitPlugin from "@plugins/conversations/plugins/conversation-view/plugins/drop-and-exit/web";
import conversationHoldAndExitPlugin from "@plugins/conversations/plugins/conversation-view/plugins/hold-and-exit/web";
import conversationExitPlugin from "@plugins/conversations/plugins/conversation-view/plugins/exit/web";
import conversationResumePlugin from "@plugins/conversations/plugins/conversation-view/plugins/resume/web";
import conversationQuickPromptsPlugin from "@plugins/conversations/plugins/conversation-view/plugins/quick-prompts/web";
import conversationForkPlugin from "@plugins/conversations/plugins/conversation-view/plugins/fork-conversation/web";
import conversationForkSessionPlugin from "@plugins/conversations/plugins/conversation-view/plugins/fork-session/web";
import conversationPushCounterPlugin from "@plugins/conversations/plugins/conversation-view/plugins/push-counter/web";
import conversationCommitsGraphPlugin from "@plugins/conversations/plugins/conversation-view/plugins/commits-graph/web";
import conversationPromptInputPlugin from "@plugins/conversations/plugins/conversation-view/plugins/prompt-input/web";
import conversationCodePlugin from "@plugins/conversations/plugins/conversation-view/plugins/code/web";
import conversationCodeDocsButtonPlugin from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/docs-button/web";
import conversationCodeReviewPlugin from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/review/web";
import conversationCodeFilePanePlugin from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
import conversationCodeFilePaneRawPlugin from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/plugins/raw/web";
import conversationCodeFilePaneMarkdownPlugin from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/plugins/markdown/web";
import conversationCodeFilePaneDiffPlugin from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/plugins/diff/web";
import conversationCodeFilePaneImagePlugin from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/plugins/image/web";
import codeExplorerPlugin from "@plugins/code-explorer/web";
import worktreeSwitcherPlugin from "@plugins/worktree-switcher/web";
import themePlugin from "@plugins/theme/web";
import welcomePlugin from "@plugins/welcome/web";
import launchPlugin from "@plugins/primitives/plugins/launch/web";
import treePlugin from "@plugins/primitives/plugins/tree/web";
import syntaxHighlightPlugin from "@plugins/primitives/plugins/syntax-highlight/web";
import fileLinksPlugin from "@plugins/primitives/plugins/file-links/web";
import primitivesPlugin from "@plugins/primitives/web";
import activeDataPlugin from "@plugins/active-data/web";
import activeDataConvPlugin from "@plugins/active-data/plugins/conv/web";
import liveStatePlugin from "@plugins/primitives/plugins/live-state/web";
import networkingPlugin from "@plugins/primitives/plugins/networking/web";
import editableFieldPlugin from "@plugins/primitives/plugins/editable-field/web";
import autoScrollPlugin from "@plugins/primitives/plugins/auto-scroll/web";
import relativeTimePlugin from "@plugins/primitives/plugins/relative-time/web";
import healthPlugin from "@plugins/health/web";
import crashesPlugin from "@plugins/crashes/web";
import statsPlugin from "@plugins/stats/web";
import statsCommitsPlugin from "@plugins/stats/plugins/commits/web";
import statsTasksPlugin from "@plugins/stats/plugins/tasks/web";
import taskDetailPlugin from "@plugins/tasks/plugins/task-detail/web";
import taskFilePeekPlugin from "@plugins/tasks/plugins/task-file-peek/web";
import taskGraphPlugin from "@plugins/tasks/plugins/task-graph/web";
import taskHeaderPlugin from "@plugins/tasks/plugins/task-header/web";
import taskDescriptionPlugin from "@plugins/tasks/plugins/task-description/web";
import taskAttachmentsPlugin from "@plugins/tasks/plugins/task-attachments/web";
import taskDependenciesPlugin from "@plugins/tasks/plugins/task-dependencies/web";
import taskEventsPlugin from "@plugins/tasks/plugins/task-events/web";
import taskListPlugin from "@plugins/tasks/plugins/task-list/web";
import agentsPlugin from "@plugins/agents/web";
import screenshotPlugin from "@plugins/screenshot/web";
import drawCanvasPlugin from "@plugins/screenshot/plugins/draw-canvas/web";
import drawOnAppPlugin from "@plugins/screenshot/plugins/draw-on-app/web";
import attachmentsPlugin from "@plugins/infra/plugins/attachments/web";
import improvePlugin from "@plugins/improve/web";
import configPlugin from "@plugins/config/web";
import eventsTestPlugin from "@plugins/events-test/web";
import conversationsRecoverPlugin from "@plugins/conversations-recover/web";
import attemptViewPlugin from "@plugins/attempt-view/web";
import authPlugin from "@plugins/auth/web";
import authGooglePlugin from "@plugins/auth/plugins/google/web";
import authNotionPlugin from "@plugins/auth/plugins/notion/web";

export const plugins: PluginDefinition[] = [
  shellPlugin,
  panePlugin,
  welcomePlugin,
  launchPlugin,
  treePlugin,
  syntaxHighlightPlugin,
  fileLinksPlugin,
  primitivesPlugin,
  activeDataPlugin,
  activeDataConvPlugin,
  liveStatePlugin,
  networkingPlugin,
  editableFieldPlugin,
  autoScrollPlugin,
  relativeTimePlugin,
  terminalPlugin,
  worktreeSwitcherPlugin,
  buildPlugin,
  debugPlugin,
  logsPlugin,
  dbBackupPlugin,
  worktreeCleanupPlugin,
  queuePlugin,
  conversationPlugin,
  conversationUiPlugin,
  conversationUiItemPlugin,
  conversationVscodePlugin,
  conversationOpenAppPlugin,
  conversationPushCounterPlugin,
  conversationCommitsGraphPlugin,
  conversationStatusPlugin,
  conversationModelPlugin,
  conversationNewChildTaskPlugin,
  conversationTasksPanelPlugin,
  conversationTerminalPanePlugin,
  conversationSideConversationPlugin,
  conversationJsonlViewerPlugin,
  conversationJsonlViewerUserTextPlugin,
  conversationJsonlViewerAssistantTextPlugin,
  conversationJsonlViewerAssistantToolUsePlugin,
  conversationJsonlViewerUserToolResultPlugin,
  conversationJsonlViewerUserImagePlugin,
  conversationJsonlViewerSystemPlugin,
  conversationJsonlViewerSummaryPlugin,
  conversationQuickPromptsPlugin,
  conversationForkPlugin,
  conversationForkSessionPlugin,
  conversationPromptInputPlugin,
  conversationPushAndExitPlugin,
  conversationSummaryPlugin,
  conversationDropAndExitPlugin,
  conversationHoldAndExitPlugin,
  conversationExitPlugin,
  conversationResumePlugin,
  conversationCodePlugin,
  conversationCodeDocsButtonPlugin,
  conversationCodeReviewPlugin,
  conversationCodeFilePanePlugin,
  conversationCodeFilePaneRawPlugin,
  conversationCodeFilePaneMarkdownPlugin,
  conversationCodeFilePaneDiffPlugin,
  conversationCodeFilePaneImagePlugin,
  codeExplorerPlugin,
  conversationsPlugin,
  conversationGroupsPlugin,
  themePlugin,
  healthPlugin,
  crashesPlugin,
  statsPlugin,
  statsTasksPlugin,
  statsCommitsPlugin,
  taskDetailPlugin,
  taskFilePeekPlugin,
  taskGraphPlugin,
  taskHeaderPlugin,
  taskDescriptionPlugin,
  taskAttachmentsPlugin,
  taskDependenciesPlugin,
  taskEventsPlugin,
  taskListPlugin,
  agentsPlugin,
  screenshotPlugin,
  drawCanvasPlugin,
  drawOnAppPlugin,
  attachmentsPlugin,
  improvePlugin,
  configPlugin,
  eventsTestPlugin,
  conversationsRecoverPlugin,
  attemptViewPlugin,
  authPlugin,
  authGooglePlugin,
  authNotionPlugin,
];
