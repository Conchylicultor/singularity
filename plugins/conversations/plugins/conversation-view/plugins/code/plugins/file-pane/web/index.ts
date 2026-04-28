export { FilePaneView } from "./components/file-pane";
export { FileContent } from "./components/file-content";
export { FilePathLabel } from "./components/file-path-label";
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
export { convFilePeekPane } from "./file-peek-pane";
export { FileOpenProvider } from "./file-open-context";
