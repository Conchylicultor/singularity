import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ThemeEngine } from "@plugins/ui/plugins/theme-engine/web";
import { chromeTheme } from "./internal/chrome-theme";

export { chromeTheme, chromeThemeScope } from "./internal/chrome-theme";

export default {
  description:
    "The app chrome's fixed theme (graphite): the rail, tab bar, action bar and toasts wear it whichever app is focused, so the frame stays the same while the app inside changes.",
  contributions: [ThemeEngine.FixedTheme(chromeTheme)],
} satisfies PluginDefinition;
