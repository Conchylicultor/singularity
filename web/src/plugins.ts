import type { PluginDefinition } from "@core";
import shellPlugin from "@plugins/shell/web";
import terminalPlugin from "@plugins/terminal/web";
import buildPlugin from "@plugins/build/web";
import logsPlugin from "@plugins/logs/web";
import conversationsPlugin from "@plugins/conversations/plugins/conversations-view/web";
import conversationPlugin from "@plugins/conversations/plugins/conversation-view/web";
import conversationVscodePlugin from "@plugins/conversations/plugins/conversation-view/plugins/vscode/web";
import conversationOpenAppPlugin from "@plugins/conversations/plugins/conversation-view/plugins/open-app/web";
import worktreeSwitcherPlugin from "@plugins/worktree-switcher/web";
import themePlugin from "@plugins/theme/web";
import welcomePlugin from "@plugins/welcome/web";

export const plugins: PluginDefinition[] = [
  shellPlugin,
  welcomePlugin,
  terminalPlugin,
  worktreeSwitcherPlugin,
  buildPlugin,
  logsPlugin,
  conversationPlugin,
  conversationVscodePlugin,
  conversationOpenAppPlugin,
  conversationsPlugin,
  themePlugin,
];
