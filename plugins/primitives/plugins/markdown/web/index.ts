import type { PluginDefinition } from "@core";

export { Markdown } from "./slots";
export type { MarkdownExtension, CodeHandler } from "./internal/types";
export { MarkdownContent } from "./internal/markdown";

export default {
  id: "markdown",
  name: "Markdown",
  description:
    "Unified markdown renderer. Extensions contribute syntax highlighting, file links, active data, and image proxy via Markdown.Extension slot.",
  contributions: [],
} satisfies PluginDefinition;
