import { queryOne, queryRows } from "@plugins/database/plugins/sql-rows/core";
import { NAMESPACE_RE } from "@plugins/infra/plugins/namespace/core";
import { z } from "zod";
import { getAdminPool } from "./pool";

/**
 * Scratch databases the cluster mints for itself, as opposed to an app's.
 *
 * Two producers, both of which build the whole name out of hex/base-36 and
 * underscores: `forkTempName` (`f_<sha8>_<rand8>__forking`) and `createTestDb`
 * (`<prefix>_<pid>_<base36>`). Capped at 63 like a namespace, and for the same
 * reason — Postgres truncates `datname` at 63 bytes silently, so a longer name
 * addresses a database other than the one it spells.
 *
 * A separate arm rather than a widened single regex: these are not namespaces
 * and must never be routable as one, and keeping them apart is what lets the app
 * arm below BE `NAMESPACE_RE` rather than a superset of it.
 */
const INTERNAL_DB_RE = /^[a-z0-9][a-z0-9_]{0,62}$/;

/**
 * The SQL-identifier boundary: every `CREATE`/`DROP DATABASE "${name}"` below
 * interpolates the name, so this is what stands between a caller-supplied string
 * and the cluster.
 *
 * An explicit allowlist of the two things a database in this cluster can BE —
 * never a `.*` with the dangerous characters subtracted, which is the spelling
 * that misses the next one.
 *
 * The app arm is literally `NAMESPACE_RE`, not a lookalike. A namespace IS the
 * database name (see `@plugins/infra/plugins/namespace/core`), so the two rules
 * are one rule with one owner and cannot drift — which is what the old
 * `/^[a-zA-Z0-9_-]+$/` could not say: it had already drifted, rejecting the
 * dotted `<composition>.<checkout>` namespaces the elision rule mints.
 */
function assertSafeName(name: string): void {
  if (NAMESPACE_RE.test(name) || INTERNAL_DB_RE.test(name)) return;
  throw new Error(`Unsafe database name: ${name}`);
}

export async function listDatabases(): Promise<string[]> {
  const rows = await queryRows(getAdminPool(), {
    // `datname` is a `name`, not `text`; the cast keeps the column's decoded
    // type the one the schema below declares.
    sql: `SELECT datname::text AS datname FROM pg_database
     WHERE datname NOT IN ('template0', 'template1', 'postgres')
     ORDER BY datname`,
    row: z.object({ datname: z.string() }),
  });
  return rows.map((r) => r.datname);
}

export async function databaseExists(name: string): Promise<boolean> {
  assertSafeName(name);
  const result = await getAdminPool().query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [name],
  );
  return result.rowCount !== null && result.rowCount > 0;
}

export async function dropDatabase(name: string): Promise<void> {
  assertSafeName(name);
  await getAdminPool().query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
}

// Create `name` if it does not already exist. `CREATE DATABASE` cannot run in a
// transaction and Postgres has no `IF NOT EXISTS` for databases, so the
// `databaseExists` guard is the idempotency mechanism; the `42P04`
// (duplicate_database) catch closes the TOCTOU window when a concurrent creator
// wins the race. Any other error is re-thrown loudly.
export async function ensureDatabase(name: string): Promise<void> {
  assertSafeName(name);
  if (await databaseExists(name)) return;
  try {
    await getAdminPool().query(`CREATE DATABASE "${name}"`);
  } catch (err) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as { code?: string }).code === "42P04"
    ) {
      return;
    }
    throw err;
  }
}

// Number of active backend connections to `name` (via pg_stat_activity). Used
// by the fork-temp sweep to avoid dropping a temp that an in-flight fork's
// pg_restore still holds a connection to.
export async function countActiveConnections(name: string): Promise<number> {
  // A bare aggregate always returns exactly one row, so an absent row is a
  // broken assumption rather than "no connections" — `queryOne` says so.
  const { n } = await queryOne(getAdminPool(), {
    sql: "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = $1",
    params: [name],
    row: z.object({ n: z.number() }),
  });
  return n;
}
