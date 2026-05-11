import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const HOME_DIR        = homedir();
export const SINGULARITY_DIR = join(HOME_DIR, ".singularity");
export const WORKTREES_DIR  = join(SINGULARITY_DIR, "worktrees");

export const PG_DIR = join(SINGULARITY_DIR, "postgres");
export const PG_DATA_DIR = join(PG_DIR, "data-pg18");
export const PG_LOG_FILE = join(PG_DIR, "postgres.log");

// Mirrors plugins/database/shared/internal/config.ts — the CLI can't import
// from @plugins/ (boundary rule), so the minimal reader is inlined here.
export const DATABASE_CONFIG_PATH = join(SINGULARITY_DIR, "database.json");

interface DatabaseConfig {
  provider?: "embedded" | "system";
  connection: { host: string; port: number; user: string };
  services: Array<{ name: string }>;
}

let cachedConfig: DatabaseConfig | null = null;

export function readDatabaseConfig(): DatabaseConfig {
  if (cachedConfig) return cachedConfig;
  try {
    cachedConfig = JSON.parse(readFileSync(DATABASE_CONFIG_PATH, "utf-8"));
    return cachedConfig!;
  } catch {
    cachedConfig = {
      connection: { host: "localhost", port: 5432, user: process.env.USER ?? "postgres" },
      services: [],
    };
    return cachedConfig;
  }
}

/**
 * libpq env block for subprocesses that should connect to the same instance
 * the server-side pools use. Reads connection params from
 * ~/.singularity/database.json; explicit PGHOST/PGPORT/PGUSER env vars
 * still override for debugging.
 */
export function libpqEnv(): Record<string, string> {
  const config = readDatabaseConfig();
  return {
    PGHOST: process.env.PGHOST ?? config.connection.host,
    PGPORT: process.env.PGPORT ?? String(config.connection.port),
    PGUSER: process.env.PGUSER ?? config.connection.user,
  };
}
