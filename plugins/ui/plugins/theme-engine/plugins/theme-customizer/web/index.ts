import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdPalette } from "react-icons/md";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { Config } from "@plugins/config/web";
import { Shell } from "@plugins/shell/web";
import { themeCustomizerPane } from "./panes";
import { VariantSettings } from "./components/theme-customizer";

export { ThemeCustomizer } from "./slots";
export { themeCustomizerPane } from "./panes";
export { TokenRow, type TokenRowProps } from "./components/token-row";
export {
  TokenModeContext,
  type TokenMode,
} from "./internal/token-mode-context";

export default {
  id: "ui-theme-customizer",
  name: "Theme Customizer",
  description:
    "Extensible theme customization pane with global preset picker, search, and contributed sections.",
  contributions: [
    Pane.Register({ pane: themeCustomizerPane }),
    Config.Section({
      id: "ui-variants",
      title: "UI Themes",
      description:
        "Choose the global theme and visual variant for each pluggable component.",
      component: VariantSettings,
    }),
    Shell.Sidebar({
      id: "theme-customizer",
      ...sidebarNavItem({
        title: "Theme",
        icon: MdPalette,
        onClick: () => openPane(themeCustomizerPane, {}, { mode: "root" }),
      }),
    }),
  ],
} satisfies PluginDefinition;
