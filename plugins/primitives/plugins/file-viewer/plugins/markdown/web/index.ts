import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { FileViewer } from "@plugins/primitives/plugins/file-viewer/web";
import { MarkdownView } from "./components/markdown-view";
import { supportsMarkdown } from "./internal/supports";

export default {
  description: "Rendered markdown preview for .md and .mdx files.",
  contributions: [
    FileViewer.Renderer({
      id: "markdown",
      label: "Markdown",
      supports: ({ file }) => supportsMarkdown(file.path),
      component: MarkdownView,
    }),
  ],
} satisfies PluginDefinition;
