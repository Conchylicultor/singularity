import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

// Re-export the upstream DSN + replica-path constants so boot.ts / the start
// script can reach them via the standard cross-plugin grammar (mirrors how
// embedded/pgbouncer export their path constants). ZERO_CACHE_PORT lives in
// the umbrella core (@plugins/database/plugins/zero/core).
export {
  ZERO_DIR,
  ZERO_REPLICA_FILE,
  ZERO_UPSTREAM_DB,
} from "../shared";

// Nothing to register: the zero-cache process is supervised by the gateway
// (via database.json), not the Bun server. We only ship a server barrel so the
// launcher can import these constants cross-plugin.
export default {
  description:
    "zero-cache sidecar service: the supervised Node process that replicates the main Postgres DB into Zero's SQLite replica. Schema-agnostic.",
} satisfies ServerPluginDefinition;
