import { describe, expect, test } from "bun:test";
import { drainWarmupsWith, type WarmupExecDeps } from "./executor";
import type { WarmupSpec } from "./registry";

// A passthrough heavy-read slot + a real macrotask yield, so the tests exercise
// the executor's own concurrency gate / scope gate / error handling without the
// host flock semaphore or the profiler wiring.
function baseDeps(
  warmups: WarmupSpec[],
  overrides: Partial<WarmupExecDeps> = {},
): WarmupExecDeps {
  return {
    warmups,
    isMain: () => true,
    withSlot: (fn) => fn(),
    yieldServer: () => new Promise<void>((r) => setImmediate(r)),
    concurrency: 2,
    ...overrides,
  };
}

describe("drainWarmupsWith", () => {
  test("skips host-scoped warm-ups when isMain() is false", async () => {
    let ran = false;
    const warmups: WarmupSpec[] = [
      { name: "host-one", scope: "host", run: async () => { ran = true; } },
    ];
    await drainWarmupsWith(baseDeps(warmups, { isMain: () => false }));
    expect(ran).toBe(false);
  });

  test("runs host-scoped warm-ups when isMain() is true", async () => {
    let ran = false;
    const warmups: WarmupSpec[] = [
      { name: "host-one", scope: "host", run: async () => { ran = true; } },
    ];
    await drainWarmupsWith(baseDeps(warmups, { isMain: () => true }));
    expect(ran).toBe(true);
  });

  test("always runs worktree-scoped warm-ups regardless of isMain()", async () => {
    let ran = false;
    const warmups: WarmupSpec[] = [
      { name: "wt-one", scope: "worktree", run: async () => { ran = true; } },
    ];
    await drainWarmupsWith(baseDeps(warmups, { isMain: () => false }));
    expect(ran).toBe(true);
  });

  test("never exceeds the concurrency cap", async () => {
    let active = 0;
    let maxObserved = 0;
    const makeRun = () => async () => {
      active++;
      maxObserved = Math.max(maxObserved, active);
      await new Promise<void>((r) => setTimeout(r, 5));
      active--;
    };
    const warmups: WarmupSpec[] = Array.from({ length: 6 }, (_, i) => ({
      name: `w${i}`,
      scope: "worktree" as const,
      run: makeRun(),
    }));
    await drainWarmupsWith(baseDeps(warmups, { concurrency: 2 }));
    expect(maxObserved).toBeLessThanOrEqual(2);
    expect(maxObserved).toBeGreaterThan(0);
  });

  test("a throwing warm-up does not abort the others", async () => {
    const ran: string[] = [];
    const warmups: WarmupSpec[] = [
      { name: "before", scope: "worktree", run: async () => { ran.push("before"); } },
      { name: "boom", scope: "worktree", run: async () => { throw new Error("kaboom"); } },
      { name: "after", scope: "worktree", run: async () => { ran.push("after"); } },
    ];
    // Must resolve (not reject) despite the throwing warm-up.
    await drainWarmupsWith(baseDeps(warmups, { concurrency: 1 }));
    expect(ran).toContain("before");
    expect(ran).toContain("after");
  });

  test("yields (a macrotask) before each warm-up that runs", async () => {
    let yields = 0;
    const warmups: WarmupSpec[] = [
      { name: "a", scope: "worktree", run: async () => {} },
      { name: "b", scope: "worktree", run: async () => {} },
    ];
    await drainWarmupsWith(
      baseDeps(warmups, {
        yieldServer: async () => { yields++; },
      }),
    );
    expect(yields).toBe(2);
  });
});
