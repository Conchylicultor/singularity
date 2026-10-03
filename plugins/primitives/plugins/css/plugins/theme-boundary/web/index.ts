import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Theme, type ThemeProps, type ThemeSurface } from "./internal/theme";
export { useEnclosingAppThemeScope } from "./internal/app-theme-scope";

export default {
  description:
    "Theme-boundary primitive: <Theme name surface> is the one element that says 'everything below here wears theme X', complete — the data-theme-scope attribute, the PortalThemeScopeProvider that carries it across portals, and the canvas it paints, which no site can now forget because `surface` is required. Plus the no-adhoc-theme-scope lint rule that keeps the three halves from being hand-assembled apart again.",
  contributions: [],
} satisfies PluginDefinition;
