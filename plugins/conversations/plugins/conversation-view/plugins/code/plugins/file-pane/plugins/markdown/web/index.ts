import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { FilePane } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
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
