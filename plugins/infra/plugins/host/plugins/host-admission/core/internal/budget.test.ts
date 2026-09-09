import { test, expect } from "bun:test";
import {
  cpuBudget,
  hostCpuCeiling,
  hostRamCeiling,
  PER_UNIT_BYTES,
  rawFleetCeiling,
} from "./budget";

// `budget.ts` is pure `node:os` arithmetic — it touches no flock file and no
// pool, so it gets its own suite rather than riding along in `grant.test.ts`,
// whose tests drive the real host `cpu` pool.
//
// Every assertion is written against the host's OWN facts rather than this box's
// numbers, so the suite passes on an 18-core Mac, a 4-core VPS and CI alike. It
// is deliberately a restatement of the formula: the property under test is not
// "B is 9", it is that `B` is derived from host facts and the RAM quantum and
// from NOTHING ELSE — in particular nothing from `HOST_POOLS`. Before
// 2026-09-09 the pool table subtracted a reserved CPU cost here, which is what
// let a pool's declaration silently move the fleet ceiling (and let the same core
// be charged twice). Re-introducing any such term makes this fail.

test("B is a pure function of host facts and the quantum — nothing from the pool table", () => {
  expect(cpuBudget().B).toBe(
    Math.max(
      1,
      Math.min(hostCpuCeiling(), Math.floor(hostRamCeiling() / PER_UNIT_BYTES)),
    ),
  );
});

test("rawFleetCeiling is the pre-floor value B floors", () => {
  const raw = rawFleetCeiling();
  expect(raw).toBe(
    Math.min(hostCpuCeiling(), Math.floor(hostRamCeiling() / PER_UNIT_BYTES)),
  );
  // The floor is the ONLY difference between the two, and it only bites on a host
  // holding less than one quantum of usable RAM.
  expect(cpuBudget().B).toBe(Math.max(1, raw));
});

test("the lane split never leaves a lane with a zero window", () => {
  // A zero-width lane is a deadlocked pool `defineHostPool` refuses to build —
  // which once made the app unbootable on a small host rather than merely slow.
  const { B, reservedInteractive, backgroundLimit } = cpuBudget();
  expect(B).toBeGreaterThanOrEqual(1);
  expect(reservedInteractive).toBeGreaterThanOrEqual(1);
  expect(backgroundLimit).toBeGreaterThanOrEqual(1);
  expect(reservedInteractive).toBeLessThanOrEqual(B);
});
