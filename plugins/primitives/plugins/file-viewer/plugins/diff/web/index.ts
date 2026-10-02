import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { FileViewer } from "@plugins/primitives/plugins/file-viewer/web";
import { FileDiffView } from "./components/file-diff-view";
import { supportsDiff } from "./internal/supports";

export default {
  description:
    "Side-by-side diff of a changed checkout file vs HEAD — a contextual tab, offered only when the host reports a non-clean git status.",
  contributions: [
    FileViewer.Renderer({
      id: "diff",
      label: "Diff",
      supports: supportsDiff,
      component: FileDiffView,
    }),
  ],
} satisfies PluginDefinition;
