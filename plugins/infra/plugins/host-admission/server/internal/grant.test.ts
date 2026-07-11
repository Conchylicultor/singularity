import { test, expect } from "bun:test";
import { withHostGrant, inheritedGrant } from "@plugins/infra/plugins/host-admission/server";
import { HOST_GRANT_ENV, HOST_LANE_ENV } from "@plugins/infra/plugins/host-admission/core";

// `withHostGrant` touches the real host `cpu` pool (flock slot files), so keep
// its footprint minimal — request a single slot on the background lane. Its only
// job here is to prove `units >= 1` and that `run` executes `fn`. The grant
// arithmetic (concurrency bound, env round-trip, env parsing) is exercised
// through `inheritedGrant`, which is pure in-process and touches NO flock.

test("withHostGrant grants at least one unit and runs fn", async () => {
  const result = await withHostGrant({ lane: "background", max: 1 }, async (g) => {
    expect(g.units).toBeGreaterThanOrEqual(1);
    return g.run(async () => 42);
  });
  expect(result).toBe(42);
});

test("inheritedGrant reads SINGULARITY_HOST_GRANT and bounds grant.run to units", async () => {
  const prevGrant = process.env[HOST_GRANT_ENV];
  const prevLane = process.env[HOST_LANE_ENV];
  process.env[HOST_GRANT_ENV] = "3";
  process.env[HOST_LANE_ENV] = "interactive";
  try {
    const g = inheritedGrant();
    expect(g).toBeDefined();
    expect(g!.units).toBe(3);
    // The env it hands a child round-trips the very values it was built from.
    expect(g!.env()).toEqual({
      [HOST_GRANT_ENV]: "3",
      [HOST_LANE_ENV]: "interactive",
    });

    // 9 tasks through a 3-unit grant: concurrency must never exceed 3.
    let active = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 9 }, () =>
        g!.run(async () => {
          active++;
          peak = Math.max(peak, active);
          await new Promise((r) => setTimeout(r, 15));
          active--;
        }),
      ),
    );
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(0);
  } finally {
    if (prevGrant === undefined) delete process.env[HOST_GRANT_ENV];
    else process.env[HOST_GRANT_ENV] = prevGrant;
    if (prevLane === undefined) delete process.env[HOST_LANE_ENV];
    else process.env[HOST_LANE_ENV] = prevLane;
  }
});

test("inheritedGrant defaults the lane to background when SINGULARITY_LANE is unset", () => {
  const prevGrant = process.env[HOST_GRANT_ENV];
  const prevLane = process.env[HOST_LANE_ENV];
  process.env[HOST_GRANT_ENV] = "2";
  delete process.env[HOST_LANE_ENV];
  try {
    const g = inheritedGrant();
    expect(g?.env()).toEqual({ [HOST_GRANT_ENV]: "2", [HOST_LANE_ENV]: "background" });
  } finally {
    if (prevGrant === undefined) delete process.env[HOST_GRANT_ENV];
    else process.env[HOST_GRANT_ENV] = prevGrant;
    if (prevLane === undefined) delete process.env[HOST_LANE_ENV];
    else process.env[HOST_LANE_ENV] = prevLane;
  }
});

test("inheritedGrant returns undefined for absent or invalid SINGULARITY_HOST_GRANT", () => {
  const prevGrant = process.env[HOST_GRANT_ENV];
  try {
    delete process.env[HOST_GRANT_ENV];
    expect(inheritedGrant()).toBeUndefined();
    for (const bad of ["0", "-1", "abc", "", "1.5", " "]) {
      process.env[HOST_GRANT_ENV] = bad;
      expect(inheritedGrant()).toBeUndefined();
    }
  } finally {
    if (prevGrant === undefined) delete process.env[HOST_GRANT_ENV];
    else process.env[HOST_GRANT_ENV] = prevGrant;
  }
});
