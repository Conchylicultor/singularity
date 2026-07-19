import { join } from "node:path";
import { defineFileSink } from "@plugins/infra/plugins/file-sink/core";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";

/** The new unified log. Append-only; every op kind writes here. */
export const OP_LOG_FILE = join(SINGULARITY_DIR, "op-log.jsonl");

/**
 * The two pre-op-log formats. READ-ONLY — nothing in this plugin ever appends to
 * them. Their own readers/reconcilers (debug/profiling/ops) still own writes.
 *
 * They are deliberately NOT `defineFileSink`s: a sink's `bound` is a growth bound
 * merged into `retention.getGrowthBounds()`, and declaring a `rotate` bound for a
 * file nothing here rotates would be an asserted rather than an earned entry
 * (see `infra/retention/server/internal/growth-bounds.ts`). They are read through
 * the FREE `readJsonlTail(path)`, which exists for exactly this case.
 */
export const LEGACY_PUSH_FILE = join(SINGULARITY_DIR, "push-contention.jsonl");
export const LEGACY_BUILD_FILE = join(SINGULARITY_DIR, "build-log.jsonl");

// The op log is the ONE writable durable artifact here — the two legacy files
// are read-only history. It is declared as a bounded file sink so it is
// enumerable in `getFileSinks()` and rotates at the 128 MB × 3 cap instead of
// growing without bound (the durable-sink invariant — see infra/file-sink).
// `append` IS the rotation, and the sink creates `~/.singularity` and appends the
// trailing newline itself.
export const opLogSink = defineFileSink({
  id: "op-log",
  description:
    "Unified op log: one record per host-contending op (build / push / check) — the requested/granted/completed phases with their per-resource wait lists. Read by the Debug → Profiling op Gantt and stats/pushes.",
  path: OP_LOG_FILE,
});

/** Append one record to the op log through its bounded sink. */
export function appendOpLog(record: unknown): void {
  opLogSink.append(JSON.stringify(record));
}
