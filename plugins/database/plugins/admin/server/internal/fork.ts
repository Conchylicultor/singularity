import { getAdminPool, openShortLivedClient, libpqSubprocessEnv } from "./pool";
import { databaseExists, dropDatabase } from "./databases";

function assertSafeName(name: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(`Unsafe database name: ${name}`);
  }
}

// Forks `source` into `target` atomically and idempotently.
//
// Atomic publish: the fork populates a disposable temp DB `<target>__forking`
// and the LAST step renames it to the canonical `<target>`. The canonical name
// therefore only ever exists once the fork fully completed — an interrupted
// fork leaves at most a disposable temp, never a half-baked canonical DB.
//
// Idempotent: a completed fork (canonical exists) is a no-op, and any stale
// temp from a previous interrupted attempt is dropped before re-forking. This
// is the precondition that makes durable retry (the `database.fork` job) safe.
export async function forkDatabase(
  source: string,
  target: string,
): Promise<void> {
  assertSafeName(source);
  assertSafeName(target);
  // Canonical name only exists on full completion → already done, no-op.
  if (await databaseExists(target)) return;
  const temp = `${target}__forking`;
  // Reap any stale temp from a previously-interrupted attempt (DROP IF EXISTS
  // WITH FORCE — terminates any lingering connection).
  await dropDatabase(temp);
  await getAdminPool().query(`CREATE DATABASE "${temp}"`);
  const subprocessEnv = { ...process.env, ...libpqSubprocessEnv() };
  const dump = Bun.spawn(["pg_dump", "-Fc", source], {
    env: subprocessEnv,
    stdout: "pipe",
    stderr: "pipe",
  });
  const restore = Bun.spawn(["pg_restore", "-d", temp], {
    env: subprocessEnv,
    stdin: dump.stdout,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [dumpExit, restoreExit] = await Promise.all([
    dump.exited,
    restore.exited,
  ]);
  if (dumpExit !== 0 || restoreExit !== 0) {
    const err = await new Response(restore.stderr).text();
    await dropDatabase(temp);
    throw new Error(`forkDatabase(${source} → ${target}) failed: ${err}`);
  }

  // The dump copies the Graphile Worker schema along with everything else.
  // Inheriting the parent's jobs, known_crontabs.last_execution, and
  // worker-lock rows is actively wrong for a fresh worktree — at minimum, a
  // forked crontab would silently skip recent runs. Drop the whole schema on
  // the temp; Graphile re-migrates (idempotent) on the first worker start.
  const shortPool = openShortLivedClient(temp);
  try {
    await shortPool.query(`DROP SCHEMA IF EXISTS graphile_worker CASCADE`);
  } finally {
    await shortPool.end();
  }

  // Atomic publish: rename the fully-populated temp to the canonical name as
  // the last step. ALTER DATABASE … RENAME requires no active connections to
  // the temp — the pg_restore connection is gone and the graphile-drop pool is
  // .end()ed above, and admin connections go direct to Postgres (not through
  // pgbouncer), so nothing blocks the rename.
  await getAdminPool().query(`ALTER DATABASE "${temp}" RENAME TO "${target}"`);
}
