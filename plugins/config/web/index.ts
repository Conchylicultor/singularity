import type { PluginDefinition } from "@core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { Shell } from "@plugins/shell/web";
import { MdSettings } from "react-icons/md";
import { settingsPane } from "./panes";

export {
  configResource,
  configSecretsResource,
  useConfigValues,
  useSecretFieldSet,
  setConfigValue,
  resetConfigValue,
} from "./internal/config-client";
export type { SecretFieldState } from "./internal/config-client";
export { Config, useSpecsWithPlugin, useSectionsWithPlugin } from "./slots";
export type { SpecWithPlugin, SectionWithPlugin } from "./slots";
export { settingsPane } from "./panes";

export default {
  id: "config",
  name: "Config",
  description:
    "Per-worktree config. Plugins declare typed fields via defineConfig; values expose in this Settings pane.",
  loadBearing: true,
  contributions: [
    Pane.Register({ pane: settingsPane }),
    Shell.Sidebar({
      id: "settings",
      ...sidebarNavItem({ title: "Settings", icon: MdSettings, onClick: () => settingsPane.open({}) }),
    }),
  ],
} satisfies PluginDefinition;
