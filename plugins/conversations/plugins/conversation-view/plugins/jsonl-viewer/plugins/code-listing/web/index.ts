import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { CodeListing, CatNListing } from "./components/code-listing";

export default {
  collapsed: true,
  description:
    "Renders code with syntax highlighting and a line-number gutter. `CodeListing` takes actual code; `CatNListing` is the `cat -n` entry point, for callers whose content is literally `cat -n` tool output.",
  contributions: [],
} satisfies PluginDefinition;
