import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const worktree = process.env.SINGULARITY_WORKTREE;
if (!worktree) {
  throw new Error("SINGULARITY_WORKTREE env var is required");
}
const host = process.env.PGHOST ?? "localhost";
const port = process.env.PGPORT ?? "5432";
const user = process.env.PGUSER ?? process.env.USER ?? "postgres";

export const connectionString = `postgres://${user}@${host}:${port}/${worktree}`;

export const sql = postgres(connectionString, { max: 5, idle_timeout: 20 });
export const db = drizzle(sql, { schema });

export const adminSql = postgres(
  `postgres://${user}@${host}:${port}/postgres`,
  { max: 1, idle_timeout: 20 },
);
