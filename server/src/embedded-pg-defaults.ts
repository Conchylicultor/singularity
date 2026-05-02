import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Defaults for the embedded Postgres cluster supervised by central
 * (`plugins/infra/plugins/database/`). Mirrored here so the server runtime
 * doesn't need to import from a plugin barrel — `server/` is core, plugins
 * may not reach into it and core may not import from plugins.
 *
 * Kept in sync by hand with `plugins/infra/plugins/database/shared/internal/paths.ts`.
 */
export const EMBEDDED_PG_SOCKET_DIR = join(
  homedir(),
  ".singularity",
  "postgres",
  "socket",
);
export const EMBEDDED_PG_PORT = "5433";
export const EMBEDDED_PG_USER = "singularity";
