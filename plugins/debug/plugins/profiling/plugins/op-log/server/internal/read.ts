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
import {
  appendJsonl,
  LEGACY_BUILD_FILE,
  LEGACY_PUSH_FILE,
  OP_LOG_FILE,
  readJsonlLines,
} from "./jsonl";

/**
 * Every op the host knows about, from the new log AND the two frozen legacy
 * files, as one merged list. The legacy files are mapped through the read-only
 * adapters and never written — this is a cutover, not a migration.
 *
 * `Date.now()` is read ONCE here and injected into every fold, so all in-flight
 * bars on one read share a single clock (and so the folds stay pure/testable).
 * That clock is what makes the bars grow on refresh — no polling is added.
 */
export function readOpRecords(): OpRecord[] {
  const now = Date.now();
  return [
    ...foldOpRecords(readJsonlLines<RawOpRecord>(OP_LOG_FILE), now),
    ...foldLegacyPushRecords(readJsonlLines<RawLegacyPushRecord>(LEGACY_PUSH_FILE), now),
    ...foldLegacyBuildRecords(readJsonlLines<RawLegacyBuildRecord>(LEGACY_BUILD_FILE)),
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
 */
export async function finalizeOrphanedOps(
  isActive: (slug: string) => Promise<boolean>,
): Promise<number> {
  const orphans = orphanedOps(readJsonlLines<RawOpRecord>(OP_LOG_FILE));
  let finalized = 0;
  for (const g of orphans) {
    // `orphanedOps` only yields groups with a `requested`, so this is total.
    const base = g.requested;
    if (!base) continue;
    if (await isActive(base.opSlug ?? "")) continue;

    appendJsonl(OP_LOG_FILE, {
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
