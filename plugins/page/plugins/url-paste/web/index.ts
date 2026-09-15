import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import "./internal/register";

export default {
  description:
    "Paste a URL into any text block (or drop one into an empty block) and it becomes a link at once, with a menu beside it: keep it as a link, mention it (the page's title becomes the link text), or — when the link is all the block holds — turn the block into a bookmark or embed.",
  contributions: [],
} satisfies PluginDefinition;
