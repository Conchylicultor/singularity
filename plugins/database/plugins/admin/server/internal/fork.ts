import { backgroundArgv } from "@plugins/packages/plugins/spawn-priority/server";
import { getAdminPool, libpqSubprocessEnv } from "./pool";
import { databaseExists, dropDatabase } from "./databases";
import { withDbForkSlot } from "./fork-gate";
import { forkTempName } from "./temp-name";
import type { ForkExclusions } from "./fork-exclusion";

// Deliberately NOT the namespace grammar `databases.ts` uses, and deliberately
// not shared with it. A fork's source and target are always MAIN-composition
// namespaces (`singularity` and a checkout's own name), which are single labels
// — a composition's database is created empty by `ensureDatabase`, never forked
// — so the dotted two-label form has no way to arrive here. The temp in between
// never reaches this guard either: `forkTempName` hashes the target to
// `f_<sha8>_<rand8>__forking`, and it is `databases.ts` that validates it.
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
//
// `exclusions` is REQUIRED rather than read from the contribution registry here.
// `getContributions()` answers `[]` in any process that never booted the server,
// so a registry read inside this function would make `./singularity db fork`
// silently produce a full ~1 GB fork that looks like it worked. A required
// parameter forces every caller to name where its exclusion set came from; see
// `forkExclusions()` in ./fork-exclusion, which fails loudly on the empty case.
// `signal` is optional and ambient — the `database.fork` job passes its
// `ctx.signal`. It cancels the host `db-fork` acquire, and once the slot is held
// it SIGKILLs the dump/restore pair, whose non-zero exits then take the existing
// failure path: the temp DB is dropped and the call throws. That ordering is the
// point — the temp is reclaimed BEFORE the abort is reported, so cancelling a fork
// never trades a released gate slot for a leaked `f_*__forking` database.
export async function forkDatabase(
  source: string,
  target: string,
  exclusions: ForkExclusions,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
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
  // What NOT to copy comes from the caller, assembled from the `ExcludeFromFork`
  // / `ExcludeSchemaFromFork` contributions each owning plugin declares (see
  // ./fork-exclusion). This file names no consumer table: `--exclude-table-data`
  // keeps a table's DDL and drops its rows, `--exclude-schema` drops a schema
  // outright. Between them they take the fork from ~970 MB of mostly
  // observability data down to the ~35 MB a worktree actually reads.
  //
  // Gate ONLY the heavy dump|restore pipeline host-wide (the step whose
  // server-side restore work spawn-priority cannot demote); the cheap admin-pool
  // ops (exists/drop/CREATE/RENAME) stay outside the slot. The
  // clients are additionally darwinbg-demoted (backgroundArgv) so their own
  // CPU/IO (compression, COPY streaming) yields to the interactive backends.
  await withDbForkSlot(async () => {
    const dump = Bun.spawn(
      backgroundArgv([
        "pg_dump",
        "-Fc",
        ...exclusions.tableData.map((t) => `--exclude-table-data=${t}`),
        ...exclusions.schemas.map((s) => `--exclude-schema=${s}`),
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
    // Cancellation, expressed as killing our own children rather than as a race
    // against the signal: a dead child exits, `exited` resolves on its own, and the
    // whole body unwinds through the failure path below that already knows how to
    // drop the temp. Nothing is abandoned mid-await.
    const onAbort = (): void => {
      dump.kill(9);
      restore.kill(9);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    let dumpExit: number;
    let restoreExit: number;
    try {
      [dumpExit, restoreExit] = await Promise.all([dump.exited, restore.exited]);
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
    if (dumpExit !== 0 || restoreExit !== 0) {
      const err = await new Response(restore.stderr).text();
      await dropDatabase(temp);
      // Reclaim first, report second. When WE killed them, the exit codes say
      // nothing useful, so the abort is the truthful failure — and it must be a
      // throw of `signal.reason`, not a fork-failed message a caller could retry
      // its way around.
      signal?.throwIfAborted();
      throw new Error(`forkDatabase(${source} → ${target}) failed: ${err}`);
    }
  }, signal);

  // The Graphile Worker schema used to be copied by the dump and then dropped
  // from the temp here. `infra/jobs` now declares it via `ExcludeSchemaFromFork`,
  // so it is excluded at DUMP time instead — the same end state (Graphile
  // re-migrates idempotently on first worker start), without paying to copy it.

  // Atomic publish: rename the fully-populated temp to the canonical name as
  // the last step. ALTER DATABASE … RENAME requires no active connections to
  // the temp — the pg_restore connection is gone, and admin connections go
  // direct to Postgres (not through pgbouncer), so nothing blocks the rename.
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
