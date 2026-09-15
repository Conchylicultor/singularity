import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { useRootThemeScope } from "./internal/use-root-theme-scope";

export default {
  description:
    "Theme-scope helper: the single definition of the focused full-surface app's theme scope, which decides the :root token layer.",
} satisfies PluginDefinition;
