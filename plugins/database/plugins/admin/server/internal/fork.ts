import { getAdminPool, openShortLivedClient, libpqSubprocessEnv } from "./pool";
import { dropDatabase } from "./databases";

function assertSafeName(name: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(`Unsafe database name: ${name}`);
  }
}

export async function forkDatabase(
  source: string,
  target: string,
): Promise<void> {
  assertSafeName(source);
  assertSafeName(target);
  await getAdminPool().query(`CREATE DATABASE "${target}"`);
  // detached: true puts each process in its own session so they are not in
  // the server's process group. The gateway kills backends via killGroup
  // (SIGKILL on the entire process group); without detaching, a mid-fork
  // pg_dump/pg_restore would die with the server and leave an empty DB shell
  // behind (CREATE DATABASE already ran, DROP DATABASE cleanup never fires).
  const subprocessEnv = { ...process.env, ...libpqSubprocessEnv };
  const dump = Bun.spawn(["pg_dump", "-Fc", source], {
    env: subprocessEnv,
    stdout: "pipe",
    stderr: "pipe",
    detached: true,
  });
  const restore = Bun.spawn(["pg_restore", "-d", target], {
    env: subprocessEnv,
    stdin: dump.stdout,
    stdout: "pipe",
    stderr: "pipe",
    detached: true,
  });
  const [dumpExit, restoreExit] = await Promise.all([
    dump.exited,
    restore.exited,
  ]);
  if (dumpExit !== 0 || restoreExit !== 0) {
    const err = await new Response(restore.stderr).text();
    await dropDatabase(target);
    throw new Error(`forkDatabase(${source} → ${target}) failed: ${err}`);
  }

  // The dump copies the Graphile Worker schema along with everything else.
  // Inheriting the parent's jobs, known_crontabs.last_execution, and
  // worker-lock rows is actively wrong for a fresh worktree — at minimum, a
  // forked crontab would silently skip recent runs. Drop the whole schema;
  // Graphile re-migrates (idempotent) on the first worker start.
  const shortPool = openShortLivedClient(target);
  try {
    await shortPool.query(`DROP SCHEMA IF EXISTS graphile_worker CASCADE`);
  } finally {
    await shortPool.end();
  }
}
