import type { Pool } from "pg";

let _adminPool: Pool | null = null;

export function setAdminPool(pool: Pool): void {
  _adminPool = pool;
}

function getAdminPool(): Pool {
  if (!_adminPool) throw new Error("adminPool not initialized — database plugin must load first");
  return _adminPool;
}

function assertSafeName(name: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(`Unsafe database name: ${name}`);
  }
}

export async function dropDatabase(name: string): Promise<void> {
  assertSafeName(name);
  await getAdminPool().query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
}

export async function databaseExists(name: string): Promise<boolean> {
  assertSafeName(name);
  const result = await getAdminPool().query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [name],
  );
  return result.rowCount !== null && result.rowCount > 0;
}
