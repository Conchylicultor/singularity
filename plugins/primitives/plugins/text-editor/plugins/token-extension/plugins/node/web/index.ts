import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { TokenPastePlugin } from "./components/token-paste-plugin";

export default {
  description:
    "The inline-token node factory's browser half: TokenPastePlugin, the registry-driven paste that materializes a pasted token as its node and declines an intra-app copy (which already carries the materialized nodes).",
  contributions: [],
} satisfies PluginDefinition;
