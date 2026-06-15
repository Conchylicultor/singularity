import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import "./internal/register";

export default {
  description:
    "Paste a URL into an empty text block to turn it into a bookmark or embed.",
  contributions: [],
} satisfies PluginDefinition;
