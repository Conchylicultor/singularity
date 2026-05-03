import { adminPool } from "@server/db/client";

function assertSafeName(name: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(`Unsafe database name: ${name}`);
  }
}

export async function dropDatabase(name: string): Promise<void> {
  assertSafeName(name);
  await adminPool.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
}

export async function databaseExists(name: string): Promise<boolean> {
  assertSafeName(name);
  const result = await adminPool.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [name],
  );
  return result.rowCount !== null && result.rowCount > 0;
}
