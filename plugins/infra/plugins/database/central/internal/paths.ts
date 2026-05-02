// Re-export from shared/ so the central runtime and any CLI/server caller
// see the same constants. Single source of truth lives in
// `plugins/infra/plugins/database/shared/internal/paths.ts`.
export {
  MAX_CONNECTIONS,
  PG_DATA_DIR,
  PG_DIR,
  PG_LOG_FILE,
  PG_MAJOR,
  PG_MIGRATING_SENTINEL,
  PG_MIGRATION_DONE_MARKER,
  PG_PID_FILE,
  PG_PORT,
  PG_SOCKET_DIR,
  PG_USER,
  useSystemPg,
} from "@plugins/infra/plugins/database/shared";
