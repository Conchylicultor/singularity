import { defineApp } from "@plugins/primitives/plugins/pane/core";

export const fileExplorerApp = defineApp({
  id: "file-explorer",
  name: "Files",
  basePath: "/files",
  iconKey: "folder",
});
