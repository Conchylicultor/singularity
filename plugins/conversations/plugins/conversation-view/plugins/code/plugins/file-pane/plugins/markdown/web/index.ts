import type { PluginDefinition } from "@core";
import { FilePane } from "../../../web/slots";
import { MarkdownView } from "./components/markdown-view";

const MD_EXT = new Set(["md", "mdx", "markdown"]);

const markdownPlugin: PluginDefinition = {
  id: "conversation-code-file-pane-markdown",
  name: "Conversation: Code — Markdown renderer",
  description: "Rendered markdown preview for .md and .mdx files.",
  contributions: [
    FilePane.Renderer({
      id: "markdown",
      label: "Markdown",
      supports: (file) => {
        const base = file.path.slice(file.path.lastIndexOf("/") + 1).toLowerCase();
        const dot = base.lastIndexOf(".");
        if (dot < 0) return false;
        return MD_EXT.has(base.slice(dot + 1)) ? "native" : false;
      },
      component: MarkdownView,
    }),
  ],
};

export default markdownPlugin;
