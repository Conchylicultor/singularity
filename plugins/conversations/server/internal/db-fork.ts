import { adminSql } from "../../../../server/src/db/client";

function assertSafeName(name: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(`Unsafe database name: ${name}`);
  }
}

export async function forkDatabase(name: string, template = "singularity"): Promise<void> {
  assertSafeName(name);
  assertSafeName(template);
  await adminSql.unsafe(`CREATE DATABASE "${name}" TEMPLATE "${template}"`);
}

export async function dropDatabase(name: string): Promise<void> {
  assertSafeName(name);
  await adminSql.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
}
