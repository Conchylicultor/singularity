import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { RegenerateIconAction } from "./components/regenerate-icon-action";

export default {
  description:
    "Regenerate action for the page icon picker: a footer row that forces a new auto-picked emoji for the page pending while the pick runs in the request.",
  contributions: [],
} satisfies PluginDefinition;
