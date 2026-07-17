import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";

/** The new unified log. Append-only; every op kind writes here. */
export const OP_LOG_FILE = join(SINGULARITY_DIR, "op-log.jsonl");

/**
 * The two pre-op-log formats. READ-ONLY — nothing in this plugin ever appends to
 * them. Their own readers/reconcilers (debug/profiling/push) still own writes.
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

/** Append one record to the op log, creating `~/.singularity` if needed. */
export function appendJsonl(file: string, record: unknown): void {
  mkdirSync(SINGULARITY_DIR, { recursive: true });
  appendFileSync(file, JSON.stringify(record) + "\n");
}
