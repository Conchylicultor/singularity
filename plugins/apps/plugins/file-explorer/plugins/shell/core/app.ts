import { defineApp } from "@plugins/primitives/plugins/pane/core";

export const fileExplorerApp = defineApp({
  id: "file-explorer",
  name: "File Explorer",
  basePath: "/files",
  iconKey: "folder",
});
