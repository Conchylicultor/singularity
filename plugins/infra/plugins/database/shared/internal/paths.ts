import { homedir } from "node:os";
import { join } from "node:path";

// Mirrors @plugins/infra/plugins/paths/server.SINGULARITY_DIR; we don't
// import that barrel here because shared/ must avoid runtime-specific
// imports. Constants are pure so the duplication is harmless.
const SINGULARITY_DIR = join(homedir(), ".singularity");

export const PG_PORT = 5433;
export const PG_USER = "singularity";
export const PG_MAJOR = 18;
export const MAX_CONNECTIONS = 500;

export const PG_DIR = join(SINGULARITY_DIR, "postgres");
export const PG_DATA_DIR = join(PG_DIR, `data-pg${PG_MAJOR}`);
export const PG_SOCKET_DIR = join(PG_DIR, "socket");
export const PG_LOG_FILE = join(PG_DIR, "postgres.log");
export const PG_MIGRATING_SENTINEL = join(PG_DIR, ".migrating");
export const PG_MIGRATION_DONE_MARKER = join(PG_DIR, "migration-completed-at");
export const PG_PID_FILE = join(PG_DATA_DIR, "postmaster.pid");

/** True when the user has explicitly opted to keep using system Postgres. */
export function useSystemPg(): boolean {
  return process.env.SINGULARITY_USE_SYSTEM_PG === "1";
}
