import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { SentinelStatus } from "@plugins/debug/plugins/sentinel/plugins/status-file/core";
import type { DetectorThresholds } from "./detector";
import { readSentinelWatch } from "@plugins/debug/plugins/sentinel/plugins/status-file/server";
import { createStatusSink, type DownStatus } from "./status-sink";
import {
  MAX_RAPID_FAILURES,
  startSentinelWorker,
  stopSentinelWorker,
  type SentinelWorkerSettings,
} from "./worker-host";

// The watcher's supervision, driven through the real host with real Bun
// Workers: a worker that throws while loading must end in ONE loud `down` —
// status file written, report filed — and the real worker must reach `ready`
// when spawned the way main spawns it (the 2026-09-15 regression: its imports
// read the runtime namespace before the worker had declared it).

const THRESHOLDS: DetectorThresholds = {
  onLoadRatio: 1.5,
  onLocksWaiting: 5,
  onBlkReadDeltaMs: 2_000,
  onBackendP99Ms: 1_000,
  onSlowBackends: 2,
  onDecompressionsPerSec: 50_000,
  onTicks: 2,
  offRatio: 0.6,
  offTicks: 2,
};

const SETTINGS: SentinelWorkerSettings = {
  // Long enough that no tick (gateway / ps / pg reads) runs during a test.
  cadenceMs: 600_000,
  thresholds: THRESHOLDS,
  maxEpisodeHoldMs: 600_000,
};

const tmpDirs: string[] = [];
function newTmpDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await stopSentinelWorker();
});

afterAll(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});

interface Rig {
  statuses: SentinelStatus[];
  reports: DownStatus[];
  logs: string[];
  statusDir: string;
  waitForState(
    state: SentinelStatus["state"],
    timeoutMs?: number,
  ): Promise<void>;
}

function rig(): Rig & { onStatus: (s: SentinelStatus) => void } {
  const statuses: SentinelStatus[] = [];
  const reports: DownStatus[] = [];
  const logs: string[] = [];
  const waiters: (() => void)[] = [];
  const statusDir = newTmpDir("sentinel-status-");
  const sink = createStatusSink({
    dir: statusDir,
    reportDown: (s) => reports.push(s),
  });
  return {
    statuses,
    reports,
    logs,
    statusDir,
    onStatus: (s) => {
      sink(s);
      statuses.push(s);
      for (const w of waiters.splice(0)) w();
    },
    waitForState: (state, timeoutMs = 15_000) =>
      new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(
            new Error(
              `no "${state}" status; statuses: ${JSON.stringify(statuses)}; logs: ${JSON.stringify(logs)}`,
            ),
          );
        }, timeoutMs);
        const check = () => {
          if (statuses.some((s) => s.state === state)) {
            clearTimeout(timer);
            resolve();
            return;
          }
          waiters.push(check);
        };
        check();
      }),
  };
}

function handlersFor(r: ReturnType<typeof rig>) {
  return {
    onSample: () => {},
    onTrip: () => {},
    onClear: () => {},
    onLog: (line: string) => r.logs.push(line),
    onStatus: r.onStatus,
  };
}

describe("sentinel worker host", () => {
  test("a worker that throws at load ends in one loud down: report + status file", async () => {
    const moduleDir = newTmpDir("sentinel-bad-worker-");
    const badWorker = join(moduleDir, "throws-at-load.ts");
    writeFileSync(
      badWorker,
      `throw new Error("sentinel test: module load failed");\n`,
    );

    const r = rig();
    startSentinelWorker({
      handlers: handlersFor(r),
      settings: SETTINGS,
      worker: { url: pathToFileURL(badWorker) },
      backoff: { minMs: 10, maxMs: 20 },
    });
    await r.waitForState("down");

    const states = r.statuses.map((s) => s.state);
    expect(states).toEqual([
      "starting",
      ...Array<SentinelStatus["state"]>(MAX_RAPID_FAILURES - 1).fill(
        "respawning",
      ),
      "down",
    ]);
    const down = r.statuses.at(-1);
    if (down?.state !== "down") throw new Error("unreachable");
    expect(down.deaths).toBe(MAX_RAPID_FAILURES);
    expect(down.lastError).toContain("module load failed");

    // One report, carrying the same give-up.
    expect(r.reports).toEqual([down]);

    // The status file every backend reads says so, owned by this live process.
    expect(readSentinelWatch(r.statusDir)).toEqual({
      kind: "recorded",
      status: down,
      pid: process.pid,
      ownerAlive: true,
    });

    // Nothing respawns after the give-up; stopping still records `stopped`.
    await stopSentinelWorker();
    expect(r.statuses.at(-1)?.state).toBe("stopped");
    const after = readSentinelWatch(r.statusDir);
    expect(after.kind === "recorded" && after.status.state).toBe("stopped");
  }, 30_000);

  test("the real worker, spawned as main spawns it, reaches ready", async () => {
    const r = rig();
    startSentinelWorker({
      handlers: handlersFor(r),
      settings: SETTINGS,
      // A throwaway data root, so the worker's latch read and any episode line
      // stay off this machine's real duress latch.
      worker: {
        url: new URL("./worker/entry.ts", import.meta.url),
        env: {
          ...Object.fromEntries(
            Object.entries(process.env).filter(
              (e): e is [string, string] => e[1] !== undefined,
            ),
          ),
          SINGULARITY_DIR: newTmpDir("sentinel-root-"),
        },
      },
    });
    await r.waitForState("running");
    expect(r.statuses.map((s) => s.state)).toEqual(["starting", "running"]);
    expect(r.reports).toEqual([]);

    await stopSentinelWorker();
    expect(r.statuses.at(-1)?.state).toBe("stopped");
  }, 30_000);
});

describe("status file ownership", () => {
  test("a later host's claim wins; the old host's writes stop landing", () => {
    const dir = newTmpDir("sentinel-owner-");
    const oldHost = createStatusSink({ dir, pid: 111, reportDown: () => {} });
    const newHost = createStatusSink({ dir, pid: 222, reportDown: () => {} });

    oldHost({ state: "running", since: 1 });
    newHost({ state: "starting", since: 2 });
    // The hot restart's old backend shuts down after the new one started.
    oldHost({ state: "stopped", since: 3 });

    const watch = readSentinelWatch(dir, (pid) => pid === 222);
    expect(watch).toEqual({
      kind: "recorded",
      status: { state: "starting", since: 2 },
      pid: 222,
      ownerAlive: true,
    });
  });

  test("a status written by a process that is gone reads as not alive", () => {
    const dir = newTmpDir("sentinel-dead-");
    createStatusSink({ dir, pid: 333, reportDown: () => {} })({
      state: "running",
      since: 1,
    });
    const watch = readSentinelWatch(dir, () => false);
    expect(watch.kind === "recorded" && watch.ownerAlive).toBe(false);
  });

  test("no file → none; garbage → unreadable", () => {
    const dir = newTmpDir("sentinel-empty-");
    expect(readSentinelWatch(dir)).toEqual({ kind: "none" });
    writeFileSync(join(dir, "status.json"), "{not json");
    expect(readSentinelWatch(dir).kind).toBe("unreadable");
  });
});
