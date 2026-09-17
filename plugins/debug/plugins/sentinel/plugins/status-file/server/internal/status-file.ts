import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  SentinelStatusRecordSchema,
  type SentinelStatus,
  type SentinelStatusRecord,
  type SentinelWatch,
} from "../../core";

// The host-global status file: main's sentinel host writes it on every
// supervision transition (a handful of writes a day); every backend reads it to
// serve `sentinel.status`, and the build CLI's admission valve reads it to say
// when the duress guard is off. A file rather than a DB row or a message, so a
// worktree backend learns main's watcher is dead without asking main — which may
// be the thing that is not answering.

export const STATUS_FILENAME = "status.json";

export function statusFilePath(dir: string): string {
  return join(dir, STATUS_FILENAME);
}

function isErrno(err: unknown, code: string): boolean {
  return err instanceof Error && (err as NodeJS.ErrnoException).code === code;
}

/** Whether a process with this pid exists. EPERM means it exists but is not ours. */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (isErrno(err, "ESRCH")) return false;
    if (isErrno(err, "EPERM")) return true;
    throw err;
  }
}

function readRecord(
  dir: string,
):
  | { kind: "none" }
  | { kind: "record"; record: SentinelStatusRecord }
  | { kind: "unreadable"; reason: string } {
  let raw: string;
  try {
    raw = readFileSync(statusFilePath(dir), "utf8");
  } catch (err) {
    if (isErrno(err, "ENOENT")) return { kind: "none" };
    throw err;
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return { kind: "unreadable", reason: `not JSON: ${err.message}` };
    }
    throw err;
  }
  const parsed = SentinelStatusRecordSchema.safeParse(json);
  if (!parsed.success) {
    return { kind: "unreadable", reason: parsed.error.message };
  }
  return { kind: "record", record: parsed.data };
}

/** What a backend serves: the recorded status, and whether its writer is alive. */
export function readSentinelWatch(
  dir: string,
  alive: (pid: number) => boolean = isPidAlive,
): SentinelWatch {
  const read = readRecord(dir);
  switch (read.kind) {
    case "none":
      return { kind: "none" };
    case "unreadable":
      return { kind: "unreadable", reason: read.reason };
    case "record":
      return {
        kind: "recorded",
        status: read.record.status,
        pid: read.record.pid,
        ownerAlive: alive(read.record.pid),
      };
  }
}

/**
 * A writer for ONE watcher host (one process). Its first write claims the file
 * unconditionally — a starting host is the new owner. Every later write lands
 * only while the file still names this pid.
 *
 * Why: a hot restart boots the new backend before the old one shuts down, so the
 * old host's `stopped` arrives AFTER the new host wrote `starting`. Without the
 * ownership check the row would read "stopped" while a watcher is running.
 */
export function createStatusWriter(
  dir: string,
  pid: number = process.pid,
): (status: SentinelStatus) => void {
  let claimed = false;
  return (status) => {
    if (claimed) {
      const current = readRecord(dir);
      if (current.kind === "record" && current.record.pid !== pid) return;
    }
    claimed = true;
    mkdirSync(dir, { recursive: true });
    const record: SentinelStatusRecord = { status, pid };
    // Write-then-rename, so a watching reader never sees half a file.
    const tmp = join(dir, `${STATUS_FILENAME}.${String(pid)}.tmp`);
    writeFileSync(tmp, JSON.stringify(record));
    renameSync(tmp, statusFilePath(dir));
  };
}
