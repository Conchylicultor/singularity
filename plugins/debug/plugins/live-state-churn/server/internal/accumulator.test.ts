import { describe, expect, it, beforeEach } from "bun:test";
import {
  recordPushAt,
  snapshotAt,
  _resetForTest,
} from "./accumulator";

beforeEach(() => {
  _resetForTest();
});

describe("accumulator", () => {
  it("reports the sustained no-op rate over the window", () => {
    const start = 1_000_000_000_000; // arbitrary fixed epoch ms
    // 5 no-op pushes/sec for 60s.
    for (let s = 0; s < 60; s++) {
      const base = start + s * 1000;
      for (let i = 0; i < 5; i++) {
        recordPushAt("res:a", { subscribers: 3, changed: false }, base + i * 100);
      }
    }
    // Snapshot at the last second of activity.
    const snap = snapshotAt(60, start + 59 * 1000 + 999);
    expect(snap).toHaveLength(1);
    const a = snap[0]!;
    expect(a.resourceKey).toBe("res:a");
    expect(a.noopCount).toBe(300);
    expect(a.totalCount).toBe(300);
    expect(a.subscribers).toBe(3);
    expect(a.noopRate).toBeCloseTo(5, 5);
  });

  it("counts changed pushes in total but not in noop", () => {
    const start = 2_000_000_000_000;
    for (let s = 0; s < 10; s++) {
      const base = start + s * 1000;
      // 4 no-op + 2 changed per second.
      for (let i = 0; i < 4; i++) {
        recordPushAt("res:b", { subscribers: 1, changed: false }, base + i * 50);
      }
      for (let i = 0; i < 2; i++) {
        recordPushAt("res:b", { subscribers: 1, changed: true }, base + 500 + i * 50);
      }
    }
    const snap = snapshotAt(10, start + 9 * 1000 + 999);
    expect(snap).toHaveLength(1);
    const b = snap[0]!;
    expect(b.noopCount).toBe(40); // 4 * 10
    expect(b.totalCount).toBe(60); // 6 * 10
    expect(b.noopRate).toBeCloseTo(4, 5); // 40 / 10s
  });

  it("prunes buckets older than the window so the rate drops over time", () => {
    const start = 3_000_000_000_000;
    // 5 no-op/sec for 60s.
    for (let s = 0; s < 60; s++) {
      const base = start + s * 1000;
      for (let i = 0; i < 5; i++) {
        recordPushAt("res:c", { subscribers: 2, changed: false }, base + i * 100);
      }
    }
    const lastActivityMs = start + 59 * 1000 + 999;

    // Immediately after activity: full rate.
    expect(snapshotAt(60, lastActivityMs).at(0)?.noopRate).toBeCloseTo(5, 5);

    // 30s later (no new pushes): only the trailing 30s of the original 60s
    // window still fall inside the window, so half the buckets remain.
    const snap30 = snapshotAt(60, lastActivityMs + 30 * 1000);
    expect(snap30[0]!.noopCount).toBeLessThan(300);
    expect(snap30[0]!.noopCount).toBeGreaterThan(0);

    // 120s later: every bucket is outside the 60s window → no totals → dropped.
    const snap120 = snapshotAt(60, lastActivityMs + 120 * 1000);
    expect(snap120).toHaveLength(0);
  });

  it("evicts the least-recently-active key past the cap", () => {
    const start = 4_000_000_000_000;
    // Fill 512 keys, each active at a distinct (increasing) time.
    for (let k = 0; k < 512; k++) {
      recordPushAt(`res:${k}`, { subscribers: 1, changed: false }, start + k);
    }
    // key 0 is the least-recently-active. Adding a 513th evicts it.
    recordPushAt("res:overflow", { subscribers: 1, changed: false }, start + 1000);

    // Snapshot at the overflow time over a wide window so surviving keys report.
    const snap = snapshotAt(600, start + 1000);
    const keys = new Set(snap.map((s) => s.resourceKey));
    expect(keys.has("res:0")).toBe(false);
    expect(keys.has("res:overflow")).toBe(true);
    expect(keys.has("res:511")).toBe(true);
  });
});
