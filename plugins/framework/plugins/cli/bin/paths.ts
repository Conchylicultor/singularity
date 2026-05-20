import { join } from "node:path";
import { readFileSync } from "node:fs";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";

export { HOME_DIR, SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";

export const WORKTREES_DIR        = join(SINGULARITY_DIR, "worktrees");
export const PG_DIR               = join(SINGULARITY_DIR, "pg");
export const PG_DATA_DIR          = join(PG_DIR, "data");
export const PG_LOG_FILE          = join(PG_DIR, "postgres.log");
export const DATABASE_CONFIG_PATH = join(SINGULARITY_DIR, "database.json");

interface DatabaseConfig {
  connection: {
    host: string;
    port: number;
    user: string;
  };
  services: Array<{
    name: string;
    start: string[];
    ready: { unix: string } | { tcp: string };
    watchdog?: { intervalSec?: number };
  }>;
}

let cachedConfig: DatabaseConfig | null = null;

export function readDatabaseConfig(): DatabaseConfig {
  if (cachedConfig) return cachedConfig;
  const raw = readFileSync(DATABASE_CONFIG_PATH, "utf8");
  cachedConfig = JSON.parse(raw);
  return cachedConfig!;
}

export function libpqEnv(): Record<string, string> {
  const config = readDatabaseConfig();
  return {
    PGHOST: process.env.PGHOST ?? config.connection.host,
    PGPORT: process.env.PGPORT ?? String(config.connection.port),
    PGUSER: process.env.PGUSER ?? config.connection.user,
  };
}
