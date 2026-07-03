import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  ensureDatabase,
  dropDatabase,
  openShortLivedClient,
} from "@plugins/database/plugins/admin/server";
import { buildConnectionString, readDatabaseConfig } from "@plugins/database/core";

// Throwaway-DB fixture for the change-feed listener suite. Provisions an isolated
// database on the ALREADY-RUNNING gateway-owned cluster via admin's public
// barrel (the same primitives forkDatabase / the backup sources use), so the
// listener suite runs the real triggers + real NOTIFY against a real Postgres in
// isolation and drops it after. Plain `.ts` (imports no `bun:test`) so it can be
// imported by the suite without coupling to the runner.
//
// Boundary rules forbid importing another plugin's internal `.ts`, so this ~25-
// line helper is co-located rather than shared with live-state-snapshot's copy.
// Follow-up: extract a shared `db-test-fixture` leaf primitive if DB-backed
// tests proliferate.

export interface TestDb {
  db: NodePgDatabase;
  connectionString: string;
  drop(): Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  // Unique per run: pid disambiguates parallel processes, the base-36 timestamp
  // disambiguates repeated runs in one process.
  const name = `cf_test_${process.pid}_${Date.now().toString(36)}`;

  try {
    await ensureDatabase(name);
  } catch (err) {
    // Cluster unreachable → fail LOUDLY with an actionable message. These tests
    // require a running cluster (started by ./singularity build); they must
    // never silently skip.
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `change-feed DB test fixture: could not reach the embedded Postgres cluster (${detail}). ` +
        `These tests require a running cluster — run ./singularity build first.`,
    );
  }

  const pool = openShortLivedClient(name);
  const db = drizzle(pool);

  // The listener opens its own raw `new Client({ connectionString })` for LISTEN,
  // so it needs a direct libpq string to THIS test DB. buildConnectionString here
  // produces the exact same format openShortLivedClient uses internally, so a raw
  // pg.Client connects with it identically.
  const connectionString = buildConnectionString(
    readDatabaseConfig().connection,
    name,
  );

  async function drop(): Promise<void> {
    await pool.end();
    await dropDatabase(name);
  }

  return { db, connectionString, drop };
}
