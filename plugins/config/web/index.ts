import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web";
import { ShellCommands } from "@plugins/shell/web";
import { MdSettings } from "react-icons/md";
import { settingsPane } from "./views";

export { configResource, useConfigValues, setConfigValue, resetConfigValue } from "./api";
export { Config, useSpecsWithPlugin, useSectionsWithPlugin } from "./slots";
export type { SpecWithPlugin, SectionWithPlugin } from "./slots";

export default {
  id: "config",
  name: "Config",
  description:
    "Per-worktree config. Plugins declare typed fields via defineConfig; values expose in this Settings pane.",
  contributions: [
    Shell.Sidebar({
      title: "Settings",
      icon: MdSettings,
      group: "System",
      onClick: () => ShellCommands.OpenPane(settingsPane()),
    }),
    Shell.Route({ pattern: "/settings", resolve: () => settingsPane() }),
  ],
} satisfies PluginDefinition;
