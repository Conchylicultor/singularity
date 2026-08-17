import { defineApp } from "@plugins/primitives/plugins/pane/core";

export const deployApp = defineApp({
  id: "deploy",
  name: "Deploy",
  basePath: "/deploy",
  iconKey: "cloud",
});
