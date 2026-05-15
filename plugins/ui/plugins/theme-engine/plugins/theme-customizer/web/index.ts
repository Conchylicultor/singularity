import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { themeCustomizerPane } from "./panes";

export { ThemeCustomizer } from "./slots";
export { themeCustomizerPane } from "./panes";
export { TokenRow, type TokenRowProps } from "./components/token-row";

export default {
  id: "ui-theme-customizer",
  name: "Theme Customizer",
  description:
    "Extensible theme customization pane with global preset picker, search, and contributed sections.",
  contributions: [Pane.Register({ pane: themeCustomizerPane })],
} satisfies PluginDefinition;
