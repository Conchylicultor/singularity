import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { themeCustomizerPane } from "./panes";

export { ThemeCustomizer } from "./slots";
export { themeCustomizerPane, themeCustomizerRoute } from "./panes";
export { TokenRow, type TokenRowProps } from "./components/token-row";
export {
  TokenModeContext,
  type TokenMode,
} from "./internal/token-mode-context";

export default {
  description:
    "Extensible theme customization pane with global preset picker, search, and contributed sections.",
  // The toolbar entry point lives in the sibling `quick-theme` plugin: the
  // palette button opens the quick-switch popover, whose footer navigates here.
  contributions: [Pane.Register({ pane: themeCustomizerPane })],
} satisfies PluginDefinition;
