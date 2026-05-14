import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Markdown, MarkdownEnhancerSlot } from "./internal/markdown";
export {
  MarkdownEnhancementContext,
  useMarkdownEnhancement,
} from "./internal/enhancement-context";
export type { MarkdownEnhancement } from "./internal/enhancement-context";
export { langFromClassName, nodeToText } from "./internal/helpers";

export default {
  id: "markdown",
  name: "Markdown",
  description:
    "Shared markdown renderer with slot-based enhancers. Consumers write <Markdown>{text}</Markdown>; context-specific behaviors auto-activate via Markdown.Enhancer contributions.",
  contributions: [],
} satisfies PluginDefinition;
