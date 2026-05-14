import type { ServerPluginDefinition } from "@server/types";

export { PG_DATA_DIR, PG_DIR, PG_LOG_FILE, PG_PORT, PG_SOCKET_DIR, PG_USER } from "../shared";

// Server side has nothing to register — the embedded PG cluster is owned
// by the gateway. We only ship a server barrel so sibling plugins can
// import paths from `@plugins/database/plugins/embedded/server` (the standard
// cross-plugin grammar).
export default {
  id: "database-embedded",
  name: "Database",
  description:
    "Embedded Postgres binaries for the gateway-owned cluster. Provides shared connection constants used by every worktree backend.",
  loadBearing: true,
} satisfies ServerPluginDefinition;
