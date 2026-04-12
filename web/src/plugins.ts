import type { PluginDefinition } from "@core";
import shellPlugin from "@plugins/shell/web";
import terminalPlugin from "@plugins/terminal/web";
import buildPlugin from "@plugins/build/web";
import logsPlugin from "@plugins/logs/web";
import conversationsPlugin from "@plugins/conversations/web";
import conversationPlugin from "@plugins/conversation/web";
import conversationVscodePlugin from "@plugins/conversation/plugins/vscode/web";
import conversationOpenAppPlugin from "@plugins/conversation/plugins/open-app/web";
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
