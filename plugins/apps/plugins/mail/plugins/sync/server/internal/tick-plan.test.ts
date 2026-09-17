import { describe, expect, test } from "bun:test";
import { planSyncTick } from "./tick-plan";

describe("planSyncTick", () => {
  test("no account yet → bootstrap (first connect)", () => {
    expect(planSyncTick([])).toEqual({ bootstrap: true, delta: [] });
  });

  test("an account with no sync-state row → bootstrap (restored from backup)", () => {
    expect(planSyncTick([{ id: "a", status: null }])).toEqual({
      bootstrap: true,
      delta: [],
    });
  });

  test("pull-ready accounts get a delta; backfilling and errored are left alone", () => {
    expect(
      planSyncTick([
        { id: "d", status: "delta" },
        { id: "i", status: "idle" },
        { id: "b", status: "backfilling" },
        { id: "e", status: "error" },
      ]),
    ).toEqual({ bootstrap: false, delta: ["d", "i"] });
  });

  test("a missing row does not stop other accounts' deltas", () => {
    expect(
      planSyncTick([
        { id: "gone", status: null },
        { id: "d", status: "delta" },
      ]),
    ).toEqual({ bootstrap: true, delta: ["d"] });
  });
});
