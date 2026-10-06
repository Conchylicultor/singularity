import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { fileExtension } from "@plugins/primitives/plugins/file-viewer/core";
import { FileViewer } from "@plugins/primitives/plugins/file-viewer/web";
import { PdfView } from "./components/pdf-view";

export default {
  description:
    "PDF preview for host .pdf files, in the browser's own PDF viewer (pages, zoom, search, print).",
  contributions: [
    FileViewer.Renderer({
      id: "pdf",
      label: "PDF",
      // A checkout's raw route serves image formats only, so a git file has
      // no URL the viewer could load.
      supports: ({ file }) =>
        file.source === "host" && fileExtension(file.path) === "pdf"
          ? "native"
          : false,
      component: PdfView,
    }),
  ],
} satisfies PluginDefinition;
