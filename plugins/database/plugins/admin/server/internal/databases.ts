import { getAdminPool } from "./pool";

function assertSafeName(name: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(`Unsafe database name: ${name}`);
  }
}

export async function listDatabases(): Promise<string[]> {
  const result = await getAdminPool().query<{ datname: string }>(
    `SELECT datname FROM pg_database
     WHERE datname NOT IN ('template0', 'template1', 'postgres')
     ORDER BY datname`,
  );
  return result.rows.map((r) => r.datname);
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
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "42P04") {
      return;
    }
    throw err;
  }
}

// Number of active backend connections to `name` (via pg_stat_activity). Used
// by the fork-temp sweep to avoid dropping a temp that an in-flight fork's
// pg_restore still holds a connection to.
export async function countActiveConnections(name: string): Promise<number> {
  const result = await getAdminPool().query<{ n: number }>(
    "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = $1",
    [name],
  );
  return result.rows[0]?.n ?? 0;
}
