// The trip decision is pure arithmetic over (marker.startedAt, op-log
// requestedAt/waitMs, now, budget), so unlike capture.test.ts / reap.test.ts —
// which MUST run against real processes because their whole point is not
// trusting a mocked signal — this one exercises the extracted pure `classifyOp`
// helper directly. `readWedgedOps` itself is a thin fs-touching wrapper
// (resolveActiveWorktreeOps + readOpRecords) whose only non-trivial logic IS
// this helper, so testing the helper is testing the decision without stubbing
// the host's real op markers / op-log.

import { describe, expect, test } from "bun:test";
import { classifyOp } from "./read-fleet";

const MIN = 60_000;
const NOW = Date.parse("2026-07-22T12:00:00.000Z");
const BUDGET = 15 * MIN;

/** An ISO instant `mins` minutes before NOW. */
function minsAgo(mins: number): string {
  return new Date(NOW - mins * MIN).toISOString();
}

describe("classifyOp", () => {
  test("over wall-budget but PARKED in host-grant (large waitMs) does NOT trip", () => {
    // Wall age 16 min > budget, but 15 min of it is recorded host-resource wait
    // (a build queued for a host CPU grant). Genuine work ≈ 1 min < budget — the
    // exact false positive this change kills.
    const marker = { startedAt: minsAgo(16) };
    const rec = { requestedAt: minsAgo(16), waitMs: 15 * MIN };

    const c = classifyOp(marker, rec, NOW, BUDGET);

    expect(c).not.toBeNull();
    expect(c!.wedgedMs).toBe(16 * MIN); // raw wall age still reported
    expect(c!.blockedMs).toBe(15 * MIN);
    expect(c!.genuineWorkMs).toBe(1 * MIN);
    expect(c!.tripped).toBe(false);
  });

  test("queued 14 min then genuinely ran 2 min does NOT trip", () => {
    const marker = { startedAt: minsAgo(16) };
    const rec = { requestedAt: minsAgo(16), waitMs: 14 * MIN };

    const c = classifyOp(marker, rec, NOW, BUDGET);

    expect(c!.genuineWorkMs).toBe(2 * MIN);
    expect(c!.tripped).toBe(false);
  });

  test("genuinely working past budget with no recorded wait DOES trip", () => {
    // 16 min old, zero host-resource wait — actually burning. Trips, as intended.
    const marker = { startedAt: minsAgo(16) };
    const rec = { requestedAt: minsAgo(16), waitMs: 0 };

    const c = classifyOp(marker, rec, NOW, BUDGET);

    expect(c!.blockedMs).toBe(0);
    expect(c!.genuineWorkMs).toBe(16 * MIN);
    expect(c!.tripped).toBe(true);
  });

  test("missing op-log record degrades to now − startedAt (blockedMs 0)", () => {
    // No correlated record: the uniform fallback anchors on the marker and
    // subtracts nothing, so a genuinely-over-budget op still trips.
    const marker = { startedAt: minsAgo(16) };

    const c = classifyOp(marker, undefined, NOW, BUDGET);

    expect(c!.blockedMs).toBe(0);
    expect(c!.genuineWorkMs).toBe(16 * MIN);
    expect(c!.wedgedMs).toBe(16 * MIN);
    expect(c!.tripped).toBe(true);
  });

  test("missing record and under budget does NOT trip", () => {
    const marker = { startedAt: minsAgo(10) };

    const c = classifyOp(marker, undefined, NOW, BUDGET);

    expect(c!.genuineWorkMs).toBe(10 * MIN);
    expect(c!.tripped).toBe(false);
  });

  test("unparseable anchor yields null — no age to judge", () => {
    const marker = { startedAt: "not-a-date" };

    expect(classifyOp(marker, undefined, NOW, BUDGET)).toBeNull();
  });
});
