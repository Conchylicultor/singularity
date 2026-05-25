import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { FilePath, toRelativePath } from "./components/file-path";

export default {
  id: "conversation-jsonl-viewer-file-path",
  name: "JSONL Viewer: File path",
  collapsed: true,
  description:
    "Clickable file path component with RTL ellipsis, copy button, and file-peek pane integration.",
  contributions: [],
} satisfies PluginDefinition;
