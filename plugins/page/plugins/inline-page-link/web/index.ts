import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import "./internal/register";

export default {
  name: "Inline Page Link",
  description:
    "Inline page links: type [[ in any text block to drop a clickable page reference; stored as a [[<pageId>]] token and fed into the backlinks index.",
  contributions: [],
} satisfies PluginDefinition;
