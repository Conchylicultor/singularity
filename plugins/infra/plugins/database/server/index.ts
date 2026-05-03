export { PG_DATA_DIR, PG_DIR, PG_LOG_FILE, PG_PORT, PG_SOCKET_DIR, PG_USER } from "@plugins/infra/plugins/database/shared";
export { dropDatabase, databaseExists } from "./internal/cluster";

// Server side has nothing to register — the embedded PG cluster is owned
// by the gateway. We only ship a server barrel so sibling plugins can
// import paths from `@plugins/infra/plugins/database/server` (the standard
// cross-plugin grammar).
export { default } from "./internal/plugin";
