import { basename } from "node:path";
import { defineExternalResource } from "@plugins/framework/plugins/server-core/core";
import {
  createFileWatcher,
  type FileWatcher,
} from "@plugins/infra/plugins/file-watcher/server";
import {
  duressLatchDir,
  LATCH_FILENAME,
  readFreshDuress,
} from "@plugins/infra/plugins/host/plugins/duress/plugins/latch/server";
import {
  sentinelStatusResource,
  sentinelVitalsResource,
  type SentinelStatusValue,
  type SentinelVitals,
} from "../../core";
import {
  readSentinelVitals,
  readSentinelWatch,
  sentinelStatusDir,
  STATUS_FILENAME,
  VITALS_FILENAME,
} from "@plugins/debug/plugins/sentinel/plugins/status-file/server";

// `sentinel.status` and `sentinel.vitals` on EVERY backend, not just main: the
// watcher runs only in main, but an agent mostly looks at its own worktree's
// health report. Every backend serves the host-global files main's watcher
// writes, and pushes when a file changes — the file-watcher primitive, no
// polling. External, not DB-backed, so they keep the hand `notify()`.
//
// The pid-liveness half of the status is computed at read time, so a main that
// died without writing `stopped` reads as not running the next time anything
// reads the file (a subscribe, a reconnect, any later write).

export function readStatusValue(): SentinelStatusValue {
  const latch = readFreshDuress();
  return {
    watch: readSentinelWatch(sentinelStatusDir.path),
    duress: latch === null ? null : { since: latch.setAt },
  };
}

export const sentinelStatusServerResource = defineExternalResource(
  sentinelStatusResource,
  {
    mode: "push",
    loader: () => Promise.resolve(readStatusValue()),
  },
);

/**
 * The latest reading, marked `current` only when the status file names its
 * writer as the watcher running now (same pid, still alive).
 */
export function readVitalsValue(
  dir: string = sentinelStatusDir.path,
  alive?: (pid: number) => boolean,
): SentinelVitals {
  const read = readSentinelVitals(dir);
  if (read.kind !== "recorded") return read;
  const watch = readSentinelWatch(dir, alive);
  const current =
    watch.kind === "recorded" &&
    watch.ownerAlive &&
    watch.status.state === "running" &&
    watch.pid === read.vitals.pid;
  return { kind: "recorded", vitals: read.vitals, current };
}

export const sentinelVitalsServerResource = defineExternalResource(
  sentinelVitalsResource,
  {
    mode: "push",
    loader: () => Promise.resolve(readVitalsValue()),
  },
);

/**
 * Which resources a changed file feeds. Routed by name so the per-tick vitals
 * write (every 5 s) never re-reads and re-pushes the status to every tab.
 */
export function resourcesForFile(path: string): {
  status: boolean;
  vitals: boolean;
} {
  switch (basename(path)) {
    case STATUS_FILENAME:
      // `current` on the vitals value is read against the status file.
      return { status: true, vitals: true };
    case VITALS_FILENAME:
      return { status: false, vitals: true };
    case LATCH_FILENAME:
      return { status: true, vitals: false };
    default:
      return { status: false, vitals: false };
  }
}

let watcher: FileWatcher | null = null;

export async function startStatusWatcher(): Promise<void> {
  if (watcher) return;
  // Subscribing to a missing directory fails; both dirs are host-global and cheap.
  const statusDir = sentinelStatusDir.ensure();
  const latchDir = duressLatchDir.ensure();
  watcher = await createFileWatcher({
    dirs: [statusDir, latchDir],
    extensions: [".json", ".latch"],
    name: "sentinel-status",
    onChange: (events) => {
      let status = false;
      let vitals = false;
      for (const event of events) {
        const hit = resourcesForFile(event.path);
        status ||= hit.status;
        vitals ||= hit.vitals;
      }
      if (status) sentinelStatusServerResource.notify();
      if (vitals) sentinelVitalsServerResource.notify();
    },
  });
}

export async function stopStatusWatcher(): Promise<void> {
  const w = watcher;
  watcher = null;
  await w?.stop();
}
