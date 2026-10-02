import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { filesAtPane, filesHomePane } from "./panes";

export { FileBrowser, type FileBrowserProps } from "./components/file-browser";
export type { ExplorerNavigator } from "./internal/navigator";
export { useHomeDir, type HomeDir } from "./internal/host-path-source";
export {
  filesAtPane,
  filesHomePane,
  useExplorerLocation,
  useOpenExplorerFolder,
} from "./panes";

export default {
  description:
    "The file explorer's browser: <FileBrowser/> (toolbar with back / forward / up, the host path bar and a filter; the folder as a lazily-listed DataView tree with Name / Modified / Size; a status bar; the selected file previewed beside it), and the /files routes it runs under — the home index and /files/at/<folder>[/<open file>], so every location is a link and back / forward are the browser history.",
  slots: { "files-home": filesHomePane, "files-at": filesAtPane },
  contributions: [
    Pane.Register({ pane: filesHomePane }),
    Pane.Register({ pane: filesAtPane }),
  ],
} satisfies PluginDefinition;
