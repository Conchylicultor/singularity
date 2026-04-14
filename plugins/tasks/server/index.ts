import type { ServerPluginDefinition } from "../../../server/src/types";

const plugin: ServerPluginDefinition = {
  id: "tasks",
  name: "Tasks",
  description: "Nested tasks with attempts linking to conversations.",
  httpRoutes: {},
};
export default plugin;
