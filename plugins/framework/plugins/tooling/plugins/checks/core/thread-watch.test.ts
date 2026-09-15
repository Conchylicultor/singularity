import { describe, expect, test } from "bun:test";
import type {
  StackFrame,
  StackSample,
} from "@plugins/infra/plugins/stack-sampler/core";
import {
  STALL_MS,
  TICK_MS,
  createWatchState,
  noteStarted,
  overlapMs,
  stepWatch,
  summarizeWatch,
  type InFlight,
} from "./thread-watch";

// The tick step is pure over (state, now, samples): no timer, no sampler, no
// clock. Every instant below is a synthetic `performance.now()` reading.
const ROOTS = ["/repo"];

function js(name: string, sourceURL: string): StackFrame {
  return { name, sourceURL, line: 1, column: 1, category: "JIT" };
}

function samples(n: number, frames: StackFrame[]): StackSample[] {
  return Array.from({ length: n }, (_, i) => ({ timestamp: i, frames }));
}

const IN_CHECK_X = [js("spin", "/repo/plugins/x/check/index.ts")];
const IN_HELPER = [js("helper", "/repo/plugins/y/core/helper.ts")];

const idle = (): InFlight => ({ running: [], bootstrap: [] });
const running =
  (...ids: string[]) =>
  (): InFlight => ({ running: ids, bootstrap: [] });

describe("stepWatch", () => {
  test("a late tick under STALL_MS records nothing, but is the longest late", () => {
    const state = createWatchState(0, ROOTS, idle());
    expect(stepWatch(state, TICK_MS, [], idle)).toBeNull();
    expect(
      stepWatch(state, TICK_MS + 950, samples(5, IN_CHECK_X), idle),
    ).toBeNull();
    expect(state.stalls).toEqual([]);
    expect(state.longestLateMs).toBe(900);
    // Every drained sample is still attributed to the whole run.
    expect(state.run.samples).toBe(5);
  });

  test("a 7 s gap records one stall, owned by THAT batch, with the set in flight when it began", () => {
    const state = createWatchState(0, ROOTS, idle());
    stepWatch(state, 50, samples(2, IN_HELPER), running("a", "b"));
    const stall = stepWatch(
      state,
      7_050,
      [...samples(3, IN_CHECK_X), ...samples(1, IN_HELPER)],
      running("c"),
    );
    expect(stall).toMatchObject({
      offsetMs: 50,
      durationMs: 7_000,
      lateMs: 7_000 - TICK_MS,
      running: ["a", "b"],
      bootstrap: [],
      samples: 4,
    });
    expect(stall?.owners.map((o) => [o.owner, o.samples])).toEqual([
      ["check x", 3],
      ["shared helper @ plugins/y/core/helper.ts", 1],
    ]);
  });

  test("back-to-back stalls: the second's `running` is the set at the tick between them", () => {
    const state = createWatchState(0, ROOTS, running("a")());
    stepWatch(state, 2_000, [], running("b"));
    const second = stepWatch(state, 4_000, [], running("c"));
    expect(state.stalls[0]?.running).toEqual(["a"]);
    expect(second?.running).toEqual(["b"]);
  });

  test("a check that starts and blocks in the same turn is in the stall's `running`, though no tick saw it", () => {
    // The start wave of a full pass: no tick between the burst of starts and
    // the block, so the last tick's snapshot is empty.
    const state = createWatchState(0, ROOTS, idle());
    noteStarted(state, "running", "x");
    noteStarted(state, "bootstrap", "load-checks");
    const stall = stepWatch(state, 5_000, samples(3, IN_CHECK_X), idle);
    expect(stall?.running).toEqual(["x"]);
    expect(stall?.bootstrap).toEqual(["load-checks"]);
    // The window closes with the stall: the next one starts from the tick's set.
    const next = stepWatch(state, 10_000, [], idle);
    expect(next?.running).toEqual([]);
  });
});

describe("summarizeWatch", () => {
  test("the rate is measured from stall windows only, and turns sample counts into ms", () => {
    const state = createWatchState(0, ROOTS, idle());
    // 30 samples outside any stall: counted, but no evidence of the rate.
    stepWatch(state, 50, samples(30, IN_HELPER), idle);
    // 70 samples over a 7 000 ms stall window → 10 Hz.
    stepWatch(state, 7_050, samples(70, IN_CHECK_X), idle);
    const summary = summarizeWatch(state);
    expect(summary.rateHz).toBe(10);
    expect(summary.stallCount).toBe(1);
    expect(summary.stalledMs).toBe(6_950);
    expect(summary.samples).toBe(100);
    expect(summary.owners.map((o) => [o.owner, o.samples, o.ms])).toEqual([
      ["check x", 70, 7_000],
      ["shared helper @ plugins/y/core/helper.ts", 30, 3_000],
    ]);
    // "mostly X" ranks stall time, where the helper never ran.
    expect(summary.stallOwners.map((o) => o.owner)).toEqual(["check x"]);
  });

  test("no stall → shares only: rate and ms are null, never a guessed number", () => {
    const state = createWatchState(0, ROOTS, idle());
    stepWatch(state, 50, samples(10, IN_HELPER), idle);
    const summary = summarizeWatch(state);
    expect(summary.stallCount).toBe(0);
    expect(summary.rateHz).toBeNull();
    expect(summary.owners[0]?.ms).toBeNull();
    expect(summary.longestLateMs).toBe(0);
  });
});

describe("overlapMs", () => {
  test("counts the known-busy part of recorded stalls inside the window", () => {
    const state = createWatchState(0, ROOTS, idle());
    stepWatch(state, 50, [], idle);
    stepWatch(state, 7_050, [], idle); // busy window [100, 7050]
    expect(overlapMs(state, 0, 3_000, 7_060)).toBe(2_900);
    expect(overlapMs(state, 7_050, 8_000, 8_000)).toBe(0);
  });

  test("counts the CURRENT gap once it is already over STALL_MS, before the late tick runs", () => {
    const state = createWatchState(0, ROOTS, idle());
    stepWatch(state, 50, [], idle);
    const due = 50 + TICK_MS;
    // Gap still under the threshold: nothing is a stall yet.
    expect(overlapMs(state, 0, due + 500, due + 500)).toBe(0);
    // Gap over it: the open part counts, clipped to the asked window.
    const now = due + STALL_MS + 900;
    expect(overlapMs(state, now - 1_000, now, now)).toBe(1_000);
    expect(overlapMs(state, 0, now, now)).toBe(STALL_MS + 900);
  });
});
