import type { PluginDefinition } from "@core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { filePeekPane } from "./file-peek-pane";

export { FilePaneView } from "./components/file-pane";
export { FileContent } from "./components/file-content";
export { FileTabs } from "./components/file-tabs";
export {
  useFileRenderers,
  type FileRenderersHandle,
} from "./components/use-file-renderers";
export { FilePane, resolveRenderers } from "./slots";
export type {
  FileRendererContribution,
  FileRendererTarget,
  RendererMatch,
} from "./slots";
export { filePeekPane } from "./file-peek-pane";
export { useFileContent, type FileContentState } from "./use-file-content";

export default {
  id: "conversation-code-file-pane",
  name: "Conversation: Code — File pane",
  description:
    "Hosts the file-peek pane and the FilePane.Renderer slot.",
  contributions: [Pane.Register({ pane: filePeekPane })],
} satisfies PluginDefinition;
