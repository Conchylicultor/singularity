import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { FileViewer } from "@plugins/primitives/plugins/file-viewer/web";
import { isBinaryPath } from "@plugins/primitives/plugins/file-viewer/core";
import { CodeView } from "./components/code-view";

export default {
  description:
    "Code renderer: the file's text as a syntax-highlighted, line-numbered listing. The fallback tab for any file not known to be binary.",
  contributions: [
    FileViewer.Renderer({
      id: "code",
      label: "Code",
      supports: ({ file }) => (isBinaryPath(file.path) ? false : "fallback"),
      component: CodeView,
    }),
  ],
} satisfies PluginDefinition;
