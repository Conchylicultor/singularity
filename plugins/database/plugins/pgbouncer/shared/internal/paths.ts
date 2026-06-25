import { join } from "node:path";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/core";

const PG_DIR = join(SINGULARITY_DIR, "postgres");

export const PGBOUNCER_PORT = 6432;

// Same env override as the embedded plugin's PG_SOCKET_DIR — both must resolve to
// the SAME directory (PgBouncer and PG share one socket dir). Lets a packaged
// install keep the Unix socket on a short path (under the 104-byte limit) while
// its data root is a long OS app-data path. Default unchanged ⇒ dev byte-identical.
export const PGBOUNCER_SOCKET_DIR =
  process.env.SINGULARITY_PG_SOCKET_DIR ?? join(PG_DIR, "socket");

export const PGBOUNCER_CONFIG_FILE = join(PG_DIR, "pgbouncer.ini");
export const PGBOUNCER_USERLIST_FILE = join(PG_DIR, "userlist.txt");
export const PGBOUNCER_LOG_FILE = join(PG_DIR, "pgbouncer.log");

/**
 * The PgBouncer pidfile under an arbitrary install root. Used by teardown to find
 * a preview's PgBouncer (rooted at its `/tmp/sgp-XXXXXX` data dir, not the dev
 * `SINGULARITY_DIR`). `PGBOUNCER_PID_FILE` is the same path under the dev root.
 */
export function pgbouncerPidFileUnder(root: string): string {
  return join(root, "postgres", "pgbouncer.pid");
}

export const PGBOUNCER_PID_FILE = pgbouncerPidFileUnder(SINGULARITY_DIR);
