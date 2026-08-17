import { defineApp } from "@plugins/primitives/plugins/pane/core";

export const debugApp = defineApp({
  id: "debug",
  name: "Debug",
  basePath: "/debug",
  iconKey: "bug_report",
});
