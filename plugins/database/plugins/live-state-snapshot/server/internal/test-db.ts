import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  ensureDatabase,
  dropDatabase,
  openShortLivedClient,
} from "@plugins/database/plugins/admin/server";

// Throwaway isolated database on the ALREADY-RUNNING gateway-owned cluster, for
// the DB-backed persist/catch-up invariant suites. The whole value of these tests
// is the real SQL (xid8 monotonicity, ON CONFLICT upsert, text[] round-trip,
// `ORDER BY seq` replay predicate), so a fake `db` would prove nothing — we run the
// real SQL in isolation via the sanctioned admin/server primitives (the same
// public API the fork/backup sources use), then drop the database after.
export interface TestDb {
  db: NodePgDatabase;
  drop(): Promise<void>;
}

// A unique-per-run name so parallel test processes never collide. `Date.now()` /
// `process.pid` are available under bun:test (the `Date.now` ban is a
// Workflow-script constraint only).
export async function createTestDb(): Promise<TestDb> {
  const name = `lss_test_${process.pid}_${Date.now().toString(36)}`;
  try {
    await ensureDatabase(name);
  } catch (err) {
    // Loud, actionable failure — never a silent skip. If the cluster isn't up,
    // ensureDatabase can't reach `postgres` to CREATE the throwaway DB.
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `createTestDb: could not provision throwaway database "${name}". ` +
        `These tests require a running embedded Postgres cluster — run ./singularity build first. (${detail})`,
    );
  }
  const pool = openShortLivedClient(name);
  const db = drizzle(pool);
  return {
    db,
    async drop() {
      await pool.end();
      await dropDatabase(name);
    },
  };
}
