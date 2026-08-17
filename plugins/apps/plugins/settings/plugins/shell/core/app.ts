import { defineApp } from "@plugins/primitives/plugins/pane/core";

export const settingsApp = defineApp({
  id: "settings",
  name: "Settings",
  basePath: "/settings",
  iconKey: "settings",
});
