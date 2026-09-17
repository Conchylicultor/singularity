import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  SentinelStatusRecordSchema,
  type SentinelStatus,
  type SentinelStatusRecord,
  type SentinelWatch,
} from "../../core";
import {
  isErrno,
  readJsonFile,
  writeJsonAtomic,
  type JsonFileRead,
} from "./json-file";

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

function readRecord(dir: string): JsonFileRead<SentinelStatusRecord> {
  return readJsonFile(statusFilePath(dir), SentinelStatusRecordSchema);
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
    writeJsonAtomic(dir, STATUS_FILENAME, record, pid);
  };
}
