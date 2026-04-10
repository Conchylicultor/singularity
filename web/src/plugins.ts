import type { PluginDefinition } from "@core";
import shellPlugin from "@plugins/shell/web";
import dummyButtonPlugin from "@plugins/dummy-button/web";
import dummyListPlugin from "@plugins/dummy-list/web";
import dummyDetailPlugin from "@plugins/dummy-detail/web";
import terminalPlugin from "@plugins/terminal/web";
import dummyTerminalPlugin from "@plugins/dummy-terminal/web";
import buildPlugin from "@plugins/build/web";
import worktreeSwitcherPlugin from "@plugins/worktree-switcher/web";

export const plugins: PluginDefinition[] = [
  shellPlugin,
  dummyButtonPlugin,
  dummyListPlugin,
  dummyDetailPlugin,
  terminalPlugin,
  dummyTerminalPlugin,
  buildPlugin,
  worktreeSwitcherPlugin,
];
