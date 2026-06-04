import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { ActionBar } from "@plugins/shell/plugins/action-bar/web";
import { themeCustomizerPane } from "./panes";
import { ThemeCustomizerButton } from "./components/theme-customizer-button";

export { ThemeCustomizer } from "./slots";
export { themeCustomizerPane } from "./panes";
export { TokenRow, type TokenRowProps } from "./components/token-row";
export {
  TokenModeContext,
  type TokenMode,
} from "./internal/token-mode-context";

export default {
  name: "Theme Customizer",
  description:
    "Extensible theme customization pane with global preset picker, search, and contributed sections.",
  contributions: [
    Pane.Register({ pane: themeCustomizerPane }),
    ActionBar.Item({
      id: "theme-customizer",
      excludeFromReorder: true,
      component: ThemeCustomizerButton,
    }),
  ],
} satisfies PluginDefinition;
