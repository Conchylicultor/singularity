import { adminSql } from "../../../../server/src/db/client";

function assertSafeName(name: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(`Unsafe database name: ${name}`);
  }
}

export async function forkDatabase(name: string, source = "singularity"): Promise<void> {
  assertSafeName(name);
  assertSafeName(source);
  await adminSql.unsafe(`CREATE DATABASE "${name}"`);
  const dump = Bun.spawn(["pg_dump", "-Fc", source], { stdout: "pipe", stderr: "pipe" });
  const restore = Bun.spawn(["pg_restore", "-d", name], {
    stdin: dump.stdout,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [dumpExit, restoreExit] = await Promise.all([dump.exited, restore.exited]);
  if (dumpExit !== 0 || restoreExit !== 0) {
    const err = await new Response(restore.stderr).text();
    await adminSql.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    throw new Error(`forkDatabase(${name}) failed: ${err}`);
  }
}

export async function dropDatabase(name: string): Promise<void> {
  assertSafeName(name);
  await adminSql.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
}
