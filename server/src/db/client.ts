import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const worktree = process.env.SINGULARITY_WORKTREE;
if (!worktree) {
  throw new Error("SINGULARITY_WORKTREE env var is required");
}
const host = process.env.PGHOST ?? "localhost";
const port = process.env.PGPORT ?? "5432";
const user = process.env.PGUSER ?? process.env.USER ?? "postgres";

export const connectionString = `postgres://${user}@${host}:${port}/${worktree}`;

export const sql = postgres(connectionString, { max: 5, idle_timeout: 20 });
export const db = drizzle(sql);

export const adminSql = postgres(
  `postgres://${user}@${host}:${port}/postgres`,
  { max: 1, idle_timeout: 20 },
);

// Short-lived client against a named database. Used by db-fork to run
// per-db cleanup (e.g. dropping a schema) without going through the
// long-lived, per-worktree `sql` client.
export function openShortLivedSql(dbName: string) {
  return postgres(`postgres://${user}@${host}:${port}/${dbName}`, {
    max: 1,
    idle_timeout: 1,
  });
}
