import { readFileSync } from "node:fs";
import { join } from "node:path";

import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/core";

export type DatabaseProvider = "embedded" | "system";

export interface DatabaseConfig {
  provider?: DatabaseProvider;
  connection: {
    host: string;
    port: number;
    user: string;
  };
  pgbouncer?: {
    host: string;
    port: number;
  };
  services: Array<{
    name: string;
    start: string[];
    ready: { unix: string } | { tcp: string };
    watchdog?: { intervalSec?: number };
  }>;
}

const CONFIG_PATH = join(SINGULARITY_DIR, "database.json");

const SYSTEM_PG_DEFAULTS: DatabaseConfig = {
  connection: {
    host: "localhost",
    port: 5432,
    user: process.env.USER ?? "postgres",
  },
  services: [],
};

let cached: DatabaseConfig | null = null;

export function readDatabaseConfig(): DatabaseConfig {
  if (cached) return cached;
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    cached = JSON.parse(raw) as DatabaseConfig;
    return cached;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && !(err instanceof SyntaxError)) throw err;
    cached = SYSTEM_PG_DEFAULTS;
    return cached;
  }
}

/**
 * Build a libpq connection string from config connection params.
 * Hosts starting with "/" are treated as Unix-socket directories.
 */
export function buildConnectionString(
  conn: DatabaseConfig["connection"],
  database: string,
): string {
  if (conn.host.startsWith("/")) {
    return `postgres://${conn.user}@/${database}?host=${encodeURIComponent(conn.host)}&port=${conn.port}`;
  }
  return `postgres://${conn.user}@${conn.host}:${conn.port}/${database}`;
}

export { CONFIG_PATH as DATABASE_CONFIG_PATH };
