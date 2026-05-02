export { pgBin } from "@plugins/infra/plugins/database/shared";
export type { PgBinName } from "@plugins/infra/plugins/database/shared";
export { PG_DATA_DIR, PG_DIR, PG_LOG_FILE, PG_MIGRATING_SENTINEL, PG_PORT, PG_SOCKET_DIR, PG_USER } from "@plugins/infra/plugins/database/shared";

// Server side has nothing to register — the embedded PG cluster is owned
// by the central runtime. We only ship a server barrel so sibling plugins
// can import paths/binaries from `@plugins/infra/plugins/database/server`
// (the standard cross-plugin grammar).
export { default } from "./internal/plugin";
