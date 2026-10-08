// The boot wiring, end to end: importing install.ts installs the ambient loader
// entry AND hands every loader's captured tables to server-core's runtime-owned
// read-set — the index the live-state change router inverts. It is routing
// state, so neither the profiler's kill-switch nor a profile reset may touch it.
import { afterAll, expect, test } from "bun:test";
import { z } from "zod";
import {
  applyLegacyFullChange,
  defineResource,
  loadResourceByKey,
  notifyStatsFor,
  setRelationBases,
} from "@plugins/framework/plugins/server-core/core";
import {
  clearRelationBases,
  getReadSetIndex,
} from "@plugins/framework/plugins/server-core/core/testing";
import { mintReachPlan } from "@plugins/framework/plugins/resource-runtime/core";
import "./install";
import {
  recordEntrySpan,
  recordReadTables,
  resetRuntimeProfile,
} from "../../core";

// The relation bases this file installs are process-global: reset them.
afterAll(clearRelationBases);

// Run `fn` under the profiler's kill-switch, restoring the prior setting after.
async function withProfilingOff(fn: () => Promise<void>): Promise<void> {
  const prior = process.env.SINGULARITY_PROFILING;
  process.env.SINGULARITY_PROFILING = "0";
  try {
    await fn();
  } finally {
    if (prior === undefined) delete process.env.SINGULARITY_PROFILING;
    else process.env.SINGULARITY_PROFILING = prior;
  }
}

test("a loader's tables reach the router's read-set under SINGULARITY_PROFILING=0, and survive a profile reset", async () => {
  await withProfilingOff(async () => {
    await recordEntrySpan("loader", "install-test-resource", async () => {
      await Promise.resolve(); // across an await, like a real DB read
      recordReadTables(["install_test_table"]);
    });
  });
  expect(getReadSetIndex()["install-test-resource"]).toEqual([
    "install_test_table",
  ]);

  resetRuntimeProfile();
  expect(getReadSetIndex()["install-test-resource"]).toEqual([
    "install_test_table",
  ]);
});

test("legacy routing still works under SINGULARITY_PROFILING=0: a change to a table the loader read reaches the resource", async () => {
  const key = "install-test-routed";
  defineResource({
    key,
    mode: "push",
    schema: z.number(),
    loader: () => 0,
  });
  await withProfilingOff(async () => {
    // The loader entry the runtime's `wrapLoad` opens, reading one table.
    await recordEntrySpan("loader", key, async () => {
      await Promise.resolve(); // across an await, like a real DB read
      recordReadTables(["install_route_table"]);
    });
    expect(notifyStatsFor(key).feed).toBe(0);
    // No views here: every relation is its own base (change-feed sets the
    // real ones at boot).
    setRelationBases((r) => [r]);
    applyLegacyFullChange({
      source: "feed",
      table: "install_route_table",
    });
    // The legacy router inverted the read-set and scheduled the resource's
    // recompute from the feed (with no subscriber, its drain has nobody to load for).
    expect(notifyStatsFor(key).feed).toBe(1);
  });
});

test("A8 under the real wiring: a routed loader reading a table no route names fails its load in a test run", async () => {
  // A non-keyed routed value (the `reach` arm): one full route on its table.
  const routedValue = (key: string, reads: string[]) => {
    defineResource(
      { key, schema: z.number(), validateParams: () => {} },
      {
        mode: "push",
        reach: mintReachPlan({
          routes: [
            {
              id: "base",
              table: "install_reach_table",
              map: { kind: "full", reason: "test" },
              columns: [],
            },
          ],
          usesOf: () => new Map([["base", { role: "membership" as const }]]),
        }),
        loader: async () => {
          await Promise.resolve(); // across an await, like a real DB read
          recordReadTables(reads);
          return 1;
        },
      },
    );
  };
  routedValue("install-test-reach-ok", ["install_reach_table"]);
  routedValue("install-test-reach-drift", [
    "install_reach_table",
    "install_stray_table",
  ]);
  // The capture reaches the runtime through the loader entry `wrapLoad` opens,
  // and server-core turns the guard strict under a test runner.
  expect(await loadResourceByKey("install-test-reach-ok")).toBe(1);
  const failure = await loadResourceByKey("install-test-reach-drift").then(
    () => null,
    (err: unknown) => err,
  );
  expect(String(failure)).toMatch(
    /read "install_stray_table", which none of its routes names/,
  );
});
