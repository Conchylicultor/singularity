import type { PluginDefinition } from "@core";
import shellPlugin from "@plugins/shell/web";
import terminalPlugin from "@plugins/terminal/web";
import buildPlugin from "@plugins/build/web";
import logsPlugin from "@plugins/logs/web";
import conversationsPlugin from "@plugins/conversations/plugins/conversations-view/web";
import conversationPlugin from "@plugins/conversations/plugins/conversation-view/web";
import conversationVscodePlugin from "@plugins/conversations/plugins/conversation-view/plugins/vscode/web";
import conversationOpenAppPlugin from "@plugins/conversations/plugins/conversation-view/plugins/open-app/web";
import conversationStatusPlugin from "@plugins/conversations/plugins/conversation-view/plugins/status/web";
import conversationModelPlugin from "@plugins/conversations/plugins/conversation-view/plugins/model/web";
import conversationTitlePlugin from "@plugins/conversations/plugins/conversation-view/plugins/title/web";
import conversationTasksPanelPlugin from "@plugins/conversations/plugins/conversation-view/plugins/tasks-panel/web";
import conversationPushAndExitPlugin from "@plugins/conversations/plugins/conversation-view/plugins/push-and-exit/web";
import conversationCodePlugin from "@plugins/conversations/plugins/conversation-view/plugins/code/web";
import conversationCodeDocsButtonPlugin from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/docs-button/web";
import conversationCodeReviewPlugin from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/review/web";
import conversationCodeFilePaneRawPlugin from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/plugins/raw/web";
import conversationCodeFilePaneMarkdownPlugin from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/plugins/markdown/web";
import conversationCodeFilePaneDiffPlugin from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/plugins/diff/web";
import worktreeSwitcherPlugin from "@plugins/worktree-switcher/web";
import themePlugin from "@plugins/theme/web";
import welcomePlugin from "@plugins/welcome/web";
import launchPlugin from "@plugins/launch/web";
import healthPlugin from "@plugins/health/web";
import statsPlugin from "@plugins/stats/web";
import statsCommitsPlugin from "@plugins/stats/plugins/commits/web";
import statsTasksPlugin from "@plugins/stats/plugins/tasks/web";
import tasksPlugin from "@plugins/tasks/web";
import agentsPlugin from "@plugins/agents/web";
import screenshotPlugin from "@plugins/screenshot/web";
import configPlugin from "@plugins/config/web";

export const plugins: PluginDefinition[] = [
  shellPlugin,
  welcomePlugin,
  launchPlugin,
  terminalPlugin,
  worktreeSwitcherPlugin,
  buildPlugin,
  logsPlugin,
  conversationPlugin,
  conversationVscodePlugin,
  conversationOpenAppPlugin,
  conversationStatusPlugin,
  conversationModelPlugin,
  conversationTitlePlugin,
  conversationTasksPanelPlugin,
  conversationPushAndExitPlugin,
  conversationCodePlugin,
  conversationCodeDocsButtonPlugin,
  conversationCodeReviewPlugin,
  conversationCodeFilePaneRawPlugin,
  conversationCodeFilePaneMarkdownPlugin,
  conversationCodeFilePaneDiffPlugin,
  conversationsPlugin,
  themePlugin,
  healthPlugin,
  statsPlugin,
  statsTasksPlugin,
  statsCommitsPlugin,
  tasksPlugin,
  agentsPlugin,
  screenshotPlugin,
  configPlugin,
];
