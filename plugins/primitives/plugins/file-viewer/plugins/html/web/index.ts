import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { FileViewer } from "@plugins/primitives/plugins/file-viewer/web";
import { HtmlView } from "./components/html-view";
import { supportsHtml } from "./internal/supports";

export default {
  description:
    "Rendered page preview for .html and .htm files, in a sandboxed frame that can neither read nor reach the app; the Code tab is its source.",
  contributions: [
    FileViewer.Renderer({
      id: "html",
      label: "Page",
      supports: ({ file }) => supportsHtml(file.path),
      component: HtmlView,
    }),
  ],
} satisfies PluginDefinition;
