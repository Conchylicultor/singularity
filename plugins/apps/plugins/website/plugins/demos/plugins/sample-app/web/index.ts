import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { SampleVignette } from "./components/sample-vignette";

export default {
  description:
    "Shared fake-app vignette ('Project Aurora') built from real UI primitives, reused by the site demos (theme toy, release switcher). No contributions — a pure component library plugin.",
  contributions: [],
} satisfies PluginDefinition;
