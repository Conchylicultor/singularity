import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export {
  PGBOUNCER_PORT,
  PGBOUNCER_SOCKET_DIR,
} from "../shared";

export default {
  id: "database-pgbouncer",
  name: "Database PgBouncer",
  description:
    "PgBouncer connection pooler for the embedded Postgres cluster. Provides path constants for connection routing.",
  loadBearing: true,
} satisfies ServerPluginDefinition;
