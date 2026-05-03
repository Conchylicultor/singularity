import type { ServerPluginDefinition } from "@server/types";

const plugin: ServerPluginDefinition = {
  id: "database",
  name: "Database",
  description:
    "Embedded Postgres binaries for the gateway-owned cluster. Provides shared connection constants used by every worktree backend.",
  loadBearing: true,
};
export default plugin;
