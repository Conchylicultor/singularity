import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { FullPane } from "./components/full-pane";

export default {
  description:
    "Full-pane layout renderer. Paints only the active pane (route.at(-1)) full-surface — the screen-stack navigation model, mounted by full-surface apps.",
  contributions: [],
} satisfies PluginDefinition;
