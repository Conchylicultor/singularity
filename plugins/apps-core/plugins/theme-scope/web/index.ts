import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  useChromeThemeScope,
  useRootThemeScope,
} from "./internal/use-chrome-theme-scope";

export default {
  description:
    "Theme-scope helpers: the single definition of the focused full-surface app's theme scope, shared by the cross-app chrome (rail, tab bar, toaster) and the :root token layer.",
} satisfies PluginDefinition;
