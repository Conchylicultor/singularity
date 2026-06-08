import { appendFileSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { CRASHES_DIR } from "@plugins/infra/plugins/paths/server";
import type { CrashReport, CrashSource } from "../../shared/types";

// Server crashes during `uncaughtException` can't write to Postgres (the
// driver is async and the event loop is dying). We buffer to a JSONL file
// under the user's home so re-forks / branch switches don't wipe it, then
// flush on the next boot via `flushBufferedCrashes`.

const dir = CRASHES_DIR;

function bufferFile(): string {
  const worktree = process.env.SINGULARITY_WORKTREE ?? "unknown";
  return join(dir, `${worktree}.jsonl`);
}

export function appendCrashSync(source: CrashSource, err: Error): void {
  try {
    mkdirSync(dir, { recursive: true });
    const line =
      JSON.stringify({
        source,
        errorType: err.name,
        message: err.message,
        stack: err.stack,
        at: new Date().toISOString(),
      }) + "\n";
    appendFileSync(bufferFile(), line);
  // eslint-disable-next-line promise-safety/no-bare-catch
  } catch {
    // Best-effort: we're in a crash path; swallowing is better than throwing.
  }
}

export interface BufferedCrash extends CrashReport {
  at: string;
}

export function readAndClearBuffer(): BufferedCrash[] {
  const file = bufferFile();
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return [];
  }
  const crashes: BufferedCrash[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      crashes.push(JSON.parse(trimmed) as BufferedCrash);
    // eslint-disable-next-line promise-safety/no-bare-catch
    } catch {
      // Skip corrupt lines rather than failing the whole flush.
    }
  }
  try {
    unlinkSync(file);
  // eslint-disable-next-line promise-safety/no-bare-catch
  } catch {
    // If unlink fails we'll re-process these on the next boot. Duplicate
    // entries collapse via the fingerprint unique index.
  }
  return crashes;
}
