import { adminSql, openShortLivedSql } from "@server/db/client";

function assertSafeName(name: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(`Unsafe database name: ${name}`);
  }
}

export async function forkDatabase(name: string, source = "singularity"): Promise<void> {
  assertSafeName(name);
  assertSafeName(source);
  await adminSql.unsafe(`CREATE DATABASE "${name}"`);
  // detached: true puts each process in its own session so they are not in
  // the server's process group. The gateway kills backends via killGroup
  // (SIGKILL on the entire process group); without detaching, a mid-fork
  // pg_dump/pg_restore would die with the server and leave an empty DB shell
  // behind (CREATE DATABASE already ran, DROP DATABASE cleanup never fires).
  const dump = Bun.spawn(["pg_dump", "-Fc", source], {
    stdout: "pipe",
    stderr: "pipe",
    detached: true,
  });
  const restore = Bun.spawn(["pg_restore", "-d", name], {
    stdin: dump.stdout,
    stdout: "pipe",
    stderr: "pipe",
    detached: true,
  });
  const [dumpExit, restoreExit] = await Promise.all([dump.exited, restore.exited]);
  if (dumpExit !== 0 || restoreExit !== 0) {
    const err = await new Response(restore.stderr).text();
    await adminSql.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    throw new Error(`forkDatabase(${name}) failed: ${err}`);
  }

  // The dump copies the Graphile Worker schema along with everything else.
  // Inheriting the parent's `jobs`, `known_crontabs.last_execution`, and
  // worker-lock rows is actively wrong for a fresh worktree — at minimum, a
  // forked crontab would silently skip recent runs. Drop the whole schema;
  // Graphile re-migrates (idempotent) on the first worker start.
  const sql = openShortLivedSql(name);
  try {
    await sql.unsafe(`DROP SCHEMA IF EXISTS graphile_worker CASCADE`);
  } finally {
    await sql.end();
  }
}

export async function dropDatabase(name: string): Promise<void> {
  assertSafeName(name);
  await adminSql.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
}

export async function databaseExists(name: string): Promise<boolean> {
  assertSafeName(name);
  const rows = await adminSql`SELECT 1 FROM pg_database WHERE datname = ${name}`;
  return rows.length > 0;
}
