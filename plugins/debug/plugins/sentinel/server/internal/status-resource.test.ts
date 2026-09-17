import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createStatusWriter,
  writeSentinelVitals,
} from "@plugins/debug/plugins/sentinel/plugins/status-file/server";
import type { SentinelVitalsRecord } from "@plugins/debug/plugins/sentinel/plugins/status-file/core";
import { readVitalsValue, resourcesForFile } from "./status-resource";

const dirs: string[] = [];
function newDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "sentinel-status-resource-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function record(pid: number): SentinelVitalsRecord {
  return {
    pid,
    wall: Date.now(),
    cadenceMs: 5_000,
    signals: {
      loadRatio: { value: 0.3, limit: 1.5 },
      decompressionsPerSec: { value: 0, limit: 50_000 },
      locksWaiting: { value: 0, limit: 5 },
      blkReadDeltaMs: { value: 0, limit: 2_000 },
      slowBackends: { value: 0, limit: 2 },
    },
    elevated: [],
    tripped: false,
    context: { freeMemMb: 8_000, inFlightBuilds: 0, runningBackends: 3 },
  };
}

const alive = () => true;

describe("sentinel.vitals value", () => {
  test("current only when the running watcher's pid wrote the reading", () => {
    const dir = newDir();
    createStatusWriter(dir, 100)({ state: "running", since: Date.now() });

    writeSentinelVitals(dir, record(100));
    expect(readVitalsValue(dir, alive)).toMatchObject({
      kind: "recorded",
      current: true,
    });

    // A hot restart's old worker, or a leftover file from another main.
    writeSentinelVitals(dir, record(99));
    expect(readVitalsValue(dir, alive)).toMatchObject({
      kind: "recorded",
      current: false,
    });
  });

  test("not current once the watcher's process is gone or it stopped", () => {
    const dir = newDir();
    const write = createStatusWriter(dir, 100);
    write({ state: "running", since: Date.now() });
    writeSentinelVitals(dir, record(100));
    expect(readVitalsValue(dir, () => false)).toMatchObject({ current: false });

    write({ state: "stopped", since: Date.now() });
    expect(readVitalsValue(dir, alive)).toMatchObject({ current: false });
  });

  test("passes none through", () => {
    expect(readVitalsValue(newDir(), alive)).toEqual({ kind: "none" });
  });
});

describe("the status watcher's routing", () => {
  test("a vitals write never re-pushes the status", () => {
    expect(resourcesForFile("/x/locks/sentinel/vitals.json")).toEqual({
      status: false,
      vitals: true,
    });
    expect(resourcesForFile("/x/locks/sentinel/status.json")).toEqual({
      status: true,
      vitals: true,
    });
    expect(resourcesForFile("/x/locks/duress/duress.latch")).toEqual({
      status: true,
      vitals: false,
    });
    expect(resourcesForFile("/x/locks/sentinel/other.json")).toEqual({
      status: false,
      vitals: false,
    });
  });
});
