import { homedir } from "node:os";
import { join } from "node:path";

export const HOME_DIR        = homedir();
export const SINGULARITY_DIR = join(HOME_DIR, ".singularity");

// Embedded Postgres connection defaults (see plugins/infra/plugins/database/).
// Mirrored from server/src/db/client.ts so subprocess env passed to psql /
// drizzle-kit / pg_dump can route to the embedded cluster without depending
// on user shell PGHOST/PGPORT.
export const PG_DIR = join(SINGULARITY_DIR, "postgres");
export const PG_DATA_DIR = join(PG_DIR, "data-pg18");
export const PG_LOG_FILE = join(PG_DIR, "postgres.log");
export const PG_MIGRATING_SENTINEL = join(PG_DIR, ".migrating");
const EMBEDDED_PG_SOCKET = join(PG_DIR, "socket");
const EMBEDDED_PG_PORT = "5433";
const EMBEDDED_PG_USER = "singularity";

/**
 * libpq env block for subprocesses that should connect to the same instance
 * the server-side pools use. Honors `SINGULARITY_USE_SYSTEM_PG=1` for the
 * escape hatch and any pre-set PGHOST/PGPORT/PGUSER.
 */
export function libpqEnv(): Record<string, string> {
  const useSystemPg = process.env.SINGULARITY_USE_SYSTEM_PG === "1";
  return {
    PGHOST: useSystemPg
      ? (process.env.PGHOST ?? "localhost")
      : (process.env.PGHOST ?? EMBEDDED_PG_SOCKET),
    PGPORT: useSystemPg
      ? (process.env.PGPORT ?? "5432")
      : (process.env.PGPORT ?? EMBEDDED_PG_PORT),
    PGUSER: useSystemPg
      ? (process.env.PGUSER ?? process.env.USER ?? "postgres")
      : (process.env.PGUSER ?? EMBEDDED_PG_USER),
  };
}
