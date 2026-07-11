import { backgroundArgv } from "@plugins/packages/plugins/spawn-priority/server";
import { getAdminPool, openShortLivedClient, libpqSubprocessEnv } from "./pool";
import { databaseExists, dropDatabase } from "./databases";
import { withDbForkSlot } from "./fork-gate";
import { forkTempName } from "./temp-name";

function assertSafeName(name: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(`Unsafe database name: ${name}`);
  }
}

// Forks `source` into `target` atomically and idempotently.
//
// Atomic publish: the fork populates a per-invocation temp DB (unique name from
// forkTempName) and the LAST step renames it to the canonical `<target>`. The
// canonical name therefore only ever exists once the fork fully completed — an
// interrupted fork leaves at most a disposable temp, never a half-baked
// canonical DB.
//
// Lock-free concurrency: each invocation forks its OWN unique temp, so two
// concurrent callers never clobber each other; the final RENAME arbitrates
// (first writer wins, losers drop their temp). No advisory lock or semaphore.
//
// Idempotent: a completed fork (canonical exists) is a no-op. This is the
// precondition that makes durable retry (the `database.fork` job) safe.
export async function forkDatabase(
  source: string,
  target: string,
): Promise<void> {
  assertSafeName(source);
  assertSafeName(target);
  // Canonical name only exists on full completion → already done, no-op.
  if (await databaseExists(target)) return;
  const temp = forkTempName(target);
  // No stale-temp reap: forkTempName is per-invocation unique, so there is never
  // a stale temp of *our own* name to drop. Orphan reclamation is solely the
  // fork-temp-sweep's job now. Accepted trade-off: a failing target's graphile
  // retries (maxAttempts:5) each mint a fresh temp, so up to ~5 orphan
  // `f_*__forking` DBs can accumulate between the 15-min sweeps — disk cost, not
  // correctness; the sweep's zero-active-connections gate reclaims them.
  await getAdminPool().query(`CREATE DATABASE "${temp}"`);
  const subprocessEnv = {
    ...process.env,
    ...libpqSubprocessEnv(),
    // The dump/restore CLIENTS are darwinbg-demoted below, but the server-side
    // restore runs in a Postgres backend we cannot demote. Disabling parallel
    // maintenance workers keeps each restore's index builds to one backend, so
    // a fork costs at most one un-demotable core (bounded further by the
    // db-fork gate).
    PGOPTIONS: "-c max_parallel_maintenance_workers=0",
  };
  // Fork schema-only for large, worktree-irrelevant app-data tables. The main
  // DB's mail_messages corpus (Gmail sync, ~800MB) dwarfs everything a worktree
  // agent needs (~170MB), and streaming it through pg_dump|pg_restore made the
  // fork slow enough to be reliably interrupted mid-COPY (see the failures that
  // motivated this). Mail sync is main-only, so a forked worktree never needs —
  // nor would ever re-populate — these rows. We keep the table *schemas* (no
  // --exclude-table) so the DDL still exists; only the DATA is skipped.
  //
  // QUICK FIX: this hardcodes mail's table names into the generic fork path, a
  // knowledge leak the database plugin shouldn't own. The clean design (a slot
  // where a plugin declares "don't fork my data") is tracked as a follow-up.
  const EXCLUDE_TABLE_DATA = [
    "public.mail_messages",
    "public.mail_threads",
    "public.mail_message_labels",
    "public.mail_attachments",
  ];
  // Gate ONLY the heavy dump|restore pipeline host-wide (the ~18.5 s step whose
  // server-side restore work spawn-priority cannot demote); the cheap admin-pool
  // ops (exists/drop/CREATE/graphile-drop/RENAME) stay outside the slot. The
  // clients are additionally darwinbg-demoted (backgroundArgv) so their own
  // CPU/IO (compression, COPY streaming) yields to the interactive backends.
  await withDbForkSlot(async () => {
    const dump = Bun.spawn(
      backgroundArgv([
        "pg_dump",
        "-Fc",
        ...EXCLUDE_TABLE_DATA.map((t) => `--exclude-table-data=${t}`),
        source,
      ]),
      {
        env: subprocessEnv,
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const restore = Bun.spawn(backgroundArgv(["pg_restore", "-d", temp]), {
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
  });

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
  //
  // First-writer-wins arbiter: a concurrent caller may have already renamed its
  // own temp to `<target>`, so this RENAME can raise 42P04 (duplicate_database).
  // If the target now exists (dup, or the postcondition recheck — which also
  // covers a tight two-renamer catalog race surfacing as 23505), we are a loser:
  // drop our temp and return; the target is already published. Anything else is
  // a genuine failure (e.g. temp still has live connections) → rethrow loudly.
  try {
    await getAdminPool().query(
      `ALTER DATABASE "${temp}" RENAME TO "${target}"`,
    );
  } catch (err) {
    const dup =
      err instanceof Error &&
      "code" in err &&
      (err as { code?: string }).code === "42P04"; // duplicate_database
    if (dup || (await databaseExists(target))) {
      await dropDatabase(temp); // drop our loser temp; target already published
      return;
    }
    throw err;
  }
}
