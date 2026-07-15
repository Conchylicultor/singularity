import { describe, expect, test } from "bun:test";
import {
  holdThroughValve,
  MAX_VALVE_HOLD_MS,
  shouldRequeue,
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
    expect(await holdThroughValve({ gated: false }, h.deps)).toBe("cleared");
    expect(h.calls.duressChecks).toBe(0);
    expect(h.calls.holdStarts).toEqual([]);
  });

  test("no duress: returns immediately, no hold", async () => {
    const h = makeHarness({ duress: [false] });
    expect(await holdThroughValve({ gated: true }, h.deps)).toBe("cleared");
    expect(h.calls.wakes).toBe(0);
    expect(h.calls.holdStarts).toEqual([]);
    expect(h.calls.holdEnds).toEqual([]);
  });

  test("held then released: waits through the episode, then proceeds", async () => {
    // entry check: true → hold loop sees true, then false (clear) → done.
    const h = makeHarness({ duress: [true, true, true, false] });
    expect(await holdThroughValve({ gated: true }, h.deps)).toBe("cleared");
    expect(h.calls.wakes).toBe(2);
    expect(h.calls.holdStarts).toEqual(["cluster-onset: decompressionsPerSec"]);
    expect(h.calls.holdEnds).toEqual(["cleared"]);
  });

  test("max-hold bound: fails open, proceeds despite persisting duress", async () => {
    // Duress never clears; each wake advances the clock so the bound trips.
    const h = makeHarness({ duress: [true], wakeAdvanceMs: MAX_VALVE_HOLD_MS / 4 });
    expect(await holdThroughValve({ gated: true }, h.deps)).toBe("fail-open");
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

// The post-acquire re-check (gap (a)): the build holds the host grant, then asks
// whether duress tripped while it was parked in the flock queue.
describe("shouldRequeue", () => {
  test("duress tripped while parked in the grant queue ⇒ release and re-hold", () => {
    expect(shouldRequeue(true, "cleared", true)).toBe(true);
  });

  test("host calm at the re-check ⇒ run the heavy section", () => {
    expect(shouldRequeue(true, "cleared", false)).toBe(false);
  });

  test("after a fail-open hold, duress never requeues — the loop must terminate", () => {
    // The failure mode this guards: a fail-open valve returns immediately while
    // duress is still fresh, so re-checking would spin hold → requeue → hold …
    expect(shouldRequeue(true, "fail-open", true)).toBe(false);
  });

  test("an ungated build (main / detached) is never requeued", () => {
    expect(shouldRequeue(false, "cleared", true)).toBe(false);
  });
});
