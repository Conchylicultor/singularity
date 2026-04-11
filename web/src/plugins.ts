import type { PluginDefinition } from "@core";
import shellPlugin from "@plugins/shell/web";
import terminalPlugin from "@plugins/terminal/web";
import buildPlugin from "@plugins/build/web";
import logsPlugin from "@plugins/logs/web";
import claudeSessionsPlugin from "@plugins/claude-sessions/web";
import conversationPlugin from "@plugins/conversation/web";
import worktreeSwitcherPlugin from "@plugins/worktree-switcher/web";
import themePlugin from "@plugins/theme/web";

export const plugins: PluginDefinition[] = [
  shellPlugin,
  terminalPlugin,
  buildPlugin,
  logsPlugin,
  conversationPlugin,
  claudeSessionsPlugin,
  worktreeSwitcherPlugin,
  themePlugin,
];
