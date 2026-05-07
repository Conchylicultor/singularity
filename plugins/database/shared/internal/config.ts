import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface DatabaseConfig {
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

const CONFIG_PATH = join(homedir(), ".singularity", "database.json");

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
  } catch {
    cached = SYSTEM_PG_DEFAULTS;
    return cached;
  }
}

export { CONFIG_PATH as DATABASE_CONFIG_PATH };
