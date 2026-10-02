import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import {
  FileViewer,
  NoPreview,
} from "@plugins/primitives/plugins/file-viewer/web";

export default {
  description:
    'Last-resort renderer for a file no other renderer offers to show (binary formats): a large file icon, "No preview for <kind> files", and Open with default app for a host file.',
  contributions: [
    FileViewer.Renderer({
      id: "fallback",
      label: "Info",
      supports: () => "last-resort",
      component: NoPreview,
    }),
  ],
} satisfies PluginDefinition;
