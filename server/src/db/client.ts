import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const worktree = process.env.SINGULARITY_WORKTREE;
if (!worktree) {
  throw new Error("SINGULARITY_WORKTREE env var is required");
}
const host = process.env.PGHOST ?? "localhost";
const port = process.env.PGPORT ?? "5432";
const user = process.env.PGUSER ?? process.env.USER ?? "postgres";

export const connectionString = `postgres://${user}@${host}:${port}/${worktree}`;

export const pool = new Pool({
  connectionString,
  max: 5,
  idleTimeoutMillis: 20_000,
});
export const db = drizzle(pool);

export const adminPool = new Pool({
  connectionString: `postgres://${user}@${host}:${port}/postgres`,
  max: 1,
  idleTimeoutMillis: 20_000,
});

// Short-lived pool against a named database. Used by db-fork to run
// per-db cleanup (e.g. dropping a schema) without going through the
// long-lived, per-worktree `pool`.
export function openShortLivedClient(dbName: string): Pool {
  return new Pool({
    connectionString: `postgres://${user}@${host}:${port}/${dbName}`,
    max: 1,
    idleTimeoutMillis: 1_000,
  });
}
