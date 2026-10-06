import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { FileViewer as FileViewerSlots } from "./slots";

export { FileViewer, resolveRenderers } from "./slots";
export type {
  FileRendererContribution,
  FileRendererProps,
  FileRendererTarget,
  RendererMatch,
  ResolvedRenderer,
} from "./slots";
export { FileView } from "./components/file-view";
export { FileContent } from "./components/file-content";
export { FileTabs } from "./components/file-tabs";
export { NoPreview, useOpenHostFile } from "./components/no-preview";
export {
  useFileRenderers,
  type FileRenderersHandle,
} from "./components/use-file-renderers";
export {
  useFileText,
  fileTextUnavailableMessage,
  type FileTextState,
  type FileTextUnavailable,
} from "./internal/use-file-text";
export {
  useFileBytes,
  fileBytesUnavailableMessage,
  type FileBytesState,
  type FileBytesUnavailable,
} from "./internal/use-file-bytes";

export default {
  description:
    "Domain-neutral file viewer: the tiered FileViewer.Renderer registry (native / contextual / fallback / last-resort, offered as tabs), the FileView / FileContent / FileTabs hosts, and useFileText / useFileBytes reading a FileRef's text or raw bytes from the host (infra/host-fs) or a git checkout (code-api).",
  contributions: [],
  slots: { ...FileViewerSlots },
} satisfies PluginDefinition;
