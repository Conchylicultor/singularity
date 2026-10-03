import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { FileViewer } from "@plugins/primitives/plugins/file-viewer/web";
import { FileDiffView } from "./components/file-diff-view";
import { supportsDiff } from "./internal/supports";

export default {
  description:
    "Side-by-side diff of a changed file vs its checkout's base — a contextual tab, offered only when the host passes git context (checkout, path, status) with a non-clean status, wherever the file's bytes are read from.",
  contributions: [
    FileViewer.Renderer({
      id: "diff",
      label: "Diff",
      supports: supportsDiff,
      component: FileDiffView,
    }),
  ],
} satisfies PluginDefinition;
