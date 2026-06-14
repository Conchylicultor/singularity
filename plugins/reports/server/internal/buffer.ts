import { appendFileSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { REPORTS_DIR } from "@plugins/infra/plugins/paths/server";
import type { ReportSource } from "../../shared/types";

// Server crashes during `uncaughtException` can't write to Postgres (the
// driver is async and the event loop is dying). We buffer to a JSONL file
// under the user's home so re-forks / branch switches don't wipe it, then
// flush on the next boot via `flushBufferedReports`.

const dir = REPORTS_DIR;

function bufferFile(): string {
  const worktree = process.env.SINGULARITY_WORKTREE ?? "unknown";
  return join(dir, `${worktree}.jsonl`);
}

export function appendReportSync(source: ReportSource, err: Error): void {
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

// A buffered process-level crash captured synchronously during a dying event
// loop. Flat crash fields (not a ReportInput) — flushBufferedReports wraps these
// into the crash ReportKind payload on the next boot.
export interface BufferedReport {
  source: ReportSource;
  errorType: string;
  message: string;
  stack: string | undefined;
  at: string;
}

export function readAndClearBuffer(): BufferedReport[] {
  const file = bufferFile();
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return [];
  }
  const reports: BufferedReport[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      reports.push(JSON.parse(trimmed) as BufferedReport);
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
  return reports;
}
