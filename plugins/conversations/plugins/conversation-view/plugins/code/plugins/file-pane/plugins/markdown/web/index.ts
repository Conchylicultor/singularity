import type { PluginDefinition } from "@core";
import { FilePane } from "../../../web/slots";
import { MarkdownView } from "./components/markdown-view";
import { supportsMarkdown } from "./internal/supports";

export default {
  id: "conversation-code-file-pane-markdown",
  name: "Conversation: Code — Markdown renderer",
  description: "Rendered markdown preview for .md and .mdx files.",
  contributions: [
    FilePane.Renderer({
      id: "markdown",
      label: "Markdown",
      supports: supportsMarkdown,
      component: MarkdownView,
    }),
  ],
} satisfies PluginDefinition;
