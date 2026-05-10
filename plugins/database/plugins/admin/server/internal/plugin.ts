import type { ServerPluginDefinition } from "@server/types";

const plugin: ServerPluginDefinition = {
  id: "database-admin",
  name: "Database Admin",
  description:
    "Admin operations (fork, backup, drop, list) for power-user plugins.",
};
export default plugin;
