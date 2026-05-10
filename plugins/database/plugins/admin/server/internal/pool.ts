import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";

const worktree = process.env.SINGULARITY_WORKTREE;
if (!worktree) {
  throw new Error("SINGULARITY_WORKTREE env var is required");
}

interface ConnConfig {
  host: string;
  port: number;
  user: string;
}

function readConn(): ConnConfig {
  const configPath = join(homedir(), ".singularity", "database.json");
  try {
    const raw = JSON.parse(readFileSync(configPath, "utf-8"));
    return {
      host: process.env.PGHOST ?? raw.connection?.host ?? "localhost",
      port: Number(process.env.PGPORT ?? raw.connection?.port ?? 5432),
      user: process.env.PGUSER ?? raw.connection?.user ?? process.env.USER ?? "postgres",
    };
  } catch {
    return {
      host: process.env.PGHOST ?? "localhost",
      port: Number(process.env.PGPORT ?? 5432),
      user: process.env.PGUSER ?? process.env.USER ?? "postgres",
    };
  }
}

function buildConnString(conn: ConnConfig, database: string): string {
  if (conn.host.startsWith("/")) {
    return `postgres://${conn.user}@/${database}?host=${encodeURIComponent(conn.host)}&port=${conn.port}`;
  }
  return `postgres://${conn.user}@${conn.host}:${conn.port}/${database}`;
}

const conn = readConn();

export const connectionString = buildConnString(conn, worktree);

const adminPool = new Pool({
  connectionString: buildConnString(conn, "postgres"),
  max: 1,
  idleTimeoutMillis: 20_000,
});

export function getAdminPool(): Pool {
  return adminPool;
}

export function openShortLivedClient(dbName: string): Pool {
  return new Pool({
    connectionString: buildConnString(conn, dbName),
    max: 1,
    idleTimeoutMillis: 1_000,
  });
}

export const libpqSubprocessEnv: Record<string, string> = {
  PGHOST: conn.host,
  PGPORT: String(conn.port),
  PGUSER: conn.user,
};
