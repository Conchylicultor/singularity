import { describe, expect, test } from "bun:test";
import {
  holdThroughValve,
  MAX_VALVE_HOLD_MS,
  valveGates,
  type HoldOutcome,
  type ValveDeps,
} from "./admission-valve";

// Pure-logic tests of the valve decision loop: no real latch, no flock, no
// timers — every seam injected per the plan doc's test contract.

interface Script {
  /** isUnderDuress() answers, consumed in order; the last one repeats. */
  duress: boolean[];
  /** Advance the fake clock by this much on each waitForWake call. */
  wakeAdvanceMs?: number;
}

function makeHarness(script: Script) {
  let nowMs = 1_000_000;
  const duress = [...script.duress];
  let lastDuress = false;
  const calls = {
    duressChecks: 0,
    wakes: 0,
    holdStarts: [] as (string | null)[],
    holdEnds: [] as HoldOutcome[],
  };
  const deps: ValveDeps = {
    isUnderDuress: () => {
      calls.duressChecks++;
      const next = duress.shift();
      if (next !== undefined) lastDuress = next;
      return lastDuress; // the script's last answer repeats
    },
    duressReason: () => "cluster-onset: decompressionsPerSec",
    waitForWake: (maxWaitMs) => {
      calls.wakes++;
      nowMs += Math.min(script.wakeAdvanceMs ?? 1_000, maxWaitMs);
      return Promise.resolve();
    },
    now: () => nowMs,
    onHoldStart: (reason) => calls.holdStarts.push(reason),
    onHoldEnd: (outcome) => calls.holdEnds.push(outcome),
  };
  return { deps, calls };
}

describe("valveGates", () => {
  test("only the background lane is gated", () => {
    expect(valveGates("background", {})).toBe(true);
    expect(valveGates("interactive", {})).toBe(false);
  });

  test("the detached main auto-build is not gated (v1 adopted decision)", () => {
    expect(valveGates("background", { SINGULARITY_BUILD_DETACHED: "1" })).toBe(false);
  });
});

describe("holdThroughValve", () => {
  test("ungated never consults the valve", async () => {
    const h = makeHarness({ duress: [true] }); // would hold forever if consulted
    await holdThroughValve({ gated: false }, h.deps);
    expect(h.calls.duressChecks).toBe(0);
    expect(h.calls.holdStarts).toEqual([]);
  });

  test("no duress: returns immediately, no hold", async () => {
    const h = makeHarness({ duress: [false] });
    await holdThroughValve({ gated: true }, h.deps);
    expect(h.calls.wakes).toBe(0);
    expect(h.calls.holdStarts).toEqual([]);
    expect(h.calls.holdEnds).toEqual([]);
  });

  test("held then released: waits through the episode, then proceeds", async () => {
    // entry check: true → hold loop sees true, then false (clear) → done.
    const h = makeHarness({ duress: [true, true, true, false] });
    await holdThroughValve({ gated: true }, h.deps);
    expect(h.calls.wakes).toBe(2);
    expect(h.calls.holdStarts).toEqual(["cluster-onset: decompressionsPerSec"]);
    expect(h.calls.holdEnds).toEqual(["cleared"]);
  });

  test("max-hold bound: fails open, proceeds despite persisting duress", async () => {
    // Duress never clears; each wake advances the clock so the bound trips.
    const h = makeHarness({ duress: [true], wakeAdvanceMs: MAX_VALVE_HOLD_MS / 4 });
    await holdThroughValve({ gated: true }, h.deps);
    expect(h.calls.wakes).toBe(4); // 4 × (bound/4) exhausts the bound exactly
    expect(h.calls.holdEnds).toEqual(["fail-open"]);
  });

  test("waitForWake is never asked to sleep past the fail-open bound", async () => {
    const seen: number[] = [];
    const h = makeHarness({ duress: [true], wakeAdvanceMs: MAX_VALVE_HOLD_MS });
    const deps: ValveDeps = {
      ...h.deps,
      waitForWake: (maxWaitMs) => {
        seen.push(maxWaitMs);
        return h.deps.waitForWake(maxWaitMs);
      },
    };
    await holdThroughValve({ gated: true }, deps);
    expect(seen).toEqual([MAX_VALVE_HOLD_MS]); // remaining budget, not unbounded
  });
});
