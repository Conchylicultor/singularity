import { defineApp } from "@plugins/primitives/plugins/pane/core";

export const workflowsApp = defineApp({
  id: "workflows",
  name: "Workflows",
  basePath: "/workflows",
  iconKey: "schema",
});
