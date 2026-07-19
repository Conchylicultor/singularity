import {
  foldLegacyBuildRecords,
  foldLegacyPushRecords,
  foldOpRecords,
  orphanedOps,
  type OpRecord,
  type RawLegacyBuildRecord,
  type RawLegacyPushRecord,
  type RawOpRecord,
} from "@plugins/debug/plugins/profiling/plugins/op-log/core";
import { readJsonlTail } from "@plugins/infra/plugins/file-sink/core";
import { appendOpLog, LEGACY_BUILD_FILE, LEGACY_PUSH_FILE, opLogSink } from "./jsonl";

/**
 * Read the live op log through its own sink's bounded reader.
 *
 * BOUND: the reader's 8 MB default byte budget, and `includeRotated` deliberately
 * NOT set — this is a recent-ops view (the Gantt / stats window), so stitching
 * `op-log.jsonl.1`/`.2` back in would put the memory straight back. Together with
 * the two legacy files below, the worst case per request drops from ~384 MB
 * materialized (three whole-file `readFileSync`s, one of them a 128 MB × 3 sink)
 * to 24 MB.
 *
 * `missing` is folded to `[]` HERE, as one visible line rather than absorbed by
 * the reader: on a fresh host nothing has ever run, which is a legitimate empty
 * history and not a failure.
 */
function readRawOpRecords(): RawOpRecord[] {
  const result = opLogSink.readJsonlTail<RawOpRecord>();
  if (result.kind === "missing") return []; // no op has ever run on this host
  return result.records;
}

/**
 * Every op the host knows about, from the new log AND the two frozen legacy
 * files, as one merged list. The legacy files are mapped through the read-only
 * adapters and never written — this is a cutover, not a migration.
 *
 * They are read with the FREE `readJsonlTail(path)` because they have no sink and
 * must never get one: a `rotate` bound declared for a file nothing rotates would
 * be a false entry in the growth-bound registry (see `jsonl.ts`).
 *
 * `Date.now()` is read ONCE here and injected into every fold, so all in-flight
 * bars on one read share a single clock (and so the folds stay pure/testable).
 * That clock is what makes the bars grow on refresh — no polling is added.
 */
export function readOpRecords(): OpRecord[] {
  const now = Date.now();

  const legacyPush = readJsonlTail<RawLegacyPushRecord>(LEGACY_PUSH_FILE);
  const legacyBuild = readJsonlTail<RawLegacyBuildRecord>(LEGACY_BUILD_FILE);

  return [
    ...foldOpRecords(readRawOpRecords(), now),
    // A legacy file legitimately may not exist on a fresh host — fold to empty
    // explicitly at each site rather than letting the reader absorb it.
    ...foldLegacyPushRecords(legacyPush.kind === "missing" ? [] : legacyPush.records, now),
    ...foldLegacyBuildRecords(legacyBuild.kind === "missing" ? [] : legacyBuild.records),
  ];
}

/**
 * Close out orphaned in-flight ops by appending a terminal interrupted record
 * for each. ONE reconciler for all three kinds, replacing the two near-identical
 * `finalizeOrphanedPushes` / `finalizeOrphanedBuilds`.
 *
 * A hard kill (SIGKILL/OOM/power loss) cannot run the CLI's `write()`, leaving a
 * `requested` (and maybe a `granted`) with no terminal; this stamps a real
 * terminal so the op stops being recomputed as live on every read, while
 * preserving it as an interrupted trace.
 *
 * `isActive(opSlug)` guards against closing an op that is still genuinely
 * running. Liveness is keyed on the OP SLUG (basename of the worktree root),
 * never the `worktree` field — the two can differ. A null slug is treated as
 * inactive, matching the reconciler it replaces.
 *
 * APPENDS, never rewrites: concurrent CLI processes are writing this same file,
 * so a rewrite would race them. Callers must still ensure a single reconciler
 * (gate on the main backend).
 *
 * Scope is the NEW log only. The legacy files keep their own reconcilers, so
 * closing their orphans from here would double-write them.
 *
 * Returns the number of records finalized.
 *
 * SAFE under the bounded read: an op whose `requested` head was clipped away by
 * the byte budget yields a group with no `requested`, and the `if (!base)
 * continue;` below skips it rather than finalizing it from a partial view. That
 * guard used to be merely defensive; the bound makes it load-bearing. The cost of
 * the bound is that such an op is not reconciled on this pass — it simply stays
 * as-is, which is strictly better than stamping an invented terminal.
 */
export async function finalizeOrphanedOps(
  isActive: (slug: string) => Promise<boolean>,
): Promise<number> {
  const orphans = orphanedOps(readRawOpRecords());
  let finalized = 0;
  for (const g of orphans) {
    // `orphanedOps` only yields groups with a `requested`, so this is total.
    const base = g.requested;
    if (!base) continue;
    if (await isActive(base.opSlug ?? "")) continue;

    appendOpLog({
      ...base,
      phase: "completed",
      grantedAt: g.granted?.grantedAt ?? base.requestedAt,
      completedAt: null,
      // Whatever waits were on record stand; an open wait had no end, so it is
      // dropped rather than clocked to an invented instant.
      waits: g.granted?.waits ?? base.waits ?? [],
      openWait: null,
      // No real end ⇒ no real duration. The Gantt renders these as a
      // fixed-width interrupted marker, not a bar.
      holdMs: 0,
      totalMs: 0,
      outcome: "error",
      interrupted: true,
      steps: [],
    } satisfies RawOpRecord);
    finalized++;
  }
  return finalized;
}
