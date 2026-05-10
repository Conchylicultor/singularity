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
