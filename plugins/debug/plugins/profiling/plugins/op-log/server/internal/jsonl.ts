import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineFileSink } from "@plugins/infra/plugins/file-sink/server";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";

/** The new unified log. Append-only; every op kind writes here. */
export const OP_LOG_FILE = join(SINGULARITY_DIR, "op-log.jsonl");

/**
 * The two pre-op-log formats. READ-ONLY — nothing in this plugin ever appends to
 * them. Their own readers/reconcilers (debug/profiling/ops) still own writes.
 */
export const LEGACY_PUSH_FILE = join(SINGULARITY_DIR, "push-contention.jsonl");
export const LEGACY_BUILD_FILE = join(SINGULARITY_DIR, "build-log.jsonl");

/**
 * Read a JSONL file into raw lines. An absent file is a genuine empty history
 * (nothing has run yet), not a failure — every other read error propagates.
 *
 * A malformed line is SKIPPED, and only when it is malformed: the CLI appends
 * with `appendFileSync` while a reader may be mid-read, so the final line can be
 * a torn partial write. `SyntaxError` is exactly that case; anything else is a
 * real error and rethrows rather than being silently swallowed.
 */
export function readJsonlLines<T>(file: string): T[] {
  let raw: string;
  try {
    raw = readFileSync(file, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return [];
  }

  const records: T[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed) as T);
    } catch (err) {
      if (err instanceof SyntaxError) continue; // torn/partial line — tolerate
      throw err;
    }
  }
  return records;
}

// The op log is the ONE writable durable artifact here — the two legacy files
// are read-only history. It is declared as a bounded file sink so it is
// enumerable in `getFileSinks()` and rotates at the 128 MB × 3 cap instead of
// growing without bound (the durable-sink invariant — see infra/file-sink).
// `append` IS the rotation, and the sink creates `~/.singularity` and appends the
// trailing newline itself.
const opLogSink = defineFileSink({
  id: "op-log",
  description:
    "Unified op log: one record per host-contending op (build / push / check) — the requested/granted/completed phases with their per-resource wait lists. Read by the Debug → Profiling op Gantt and stats/pushes.",
  path: OP_LOG_FILE,
});

/** Append one record to the op log through its bounded sink. */
export function appendOpLog(record: unknown): void {
  opLogSink.append(JSON.stringify(record));
}
