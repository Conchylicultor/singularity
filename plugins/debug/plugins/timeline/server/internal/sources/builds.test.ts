import { describe, expect, test } from "bun:test";
import { mapBuildRows, buildsSource } from "./builds";
import type { DbSourceCtx } from "./context";

const T0 = Date.parse("2026-07-10T09:00:00.000Z");
const ctx: DbSourceCtx = {
  dbName: "wt-a",
  isMainDb: false,
  fromMs: T0,
  toMs: T0 + 60 * 60 * 1000,
};

const row = (over: Record<string, unknown> = {}) => ({
  id: "build-1",
  trigger: "manual",
  commit_hash: "abc123",
  started_at: new Date(T0 + 5 * 60 * 1000),
  finished_at: new Date(T0 + 8 * 60 * 1000),
  exit_code: 0,
  ...over,
});

describe("mapBuildRows", () => {
  test("finished build renders [startedAt, finishedAt] as info", () => {
    const [ev] = mapBuildRows([row()], ctx);
    expect(ev!.startMs).toBe(T0 + 5 * 60 * 1000);
    expect(ev!.endMs).toBe(T0 + 8 * 60 * 1000);
    expect(ev!.severity).toBe("info");
    expect(ev!.label).toBe("build (manual)");
    expect(ev!.worktree).toBe("wt-a");
    expect(ev!.detail["inFlight"]).toBe(false);
  });

  test("in-flight build is open-ended to toMs with detail.inFlight", () => {
    const [ev] = mapBuildRows([row({ finished_at: null, exit_code: null })], ctx);
    expect(ev!.endMs).toBe(ctx.toMs);
    expect(ev!.severity).toBe("info");
    expect(ev!.detail["inFlight"]).toBe(true);
    expect(ev!.detail["exitCode"]).toBe(null);
  });

  test("non-zero exit is an error (including the reconciler's -1)", () => {
    expect(mapBuildRows([row({ exit_code: 1 })], ctx)[0]!.severity).toBe("error");
    expect(mapBuildRows([row({ exit_code: -1 })], ctx)[0]!.severity).toBe("error");
  });
});

describe("buildsSource.build", () => {
  test("every DB — main included — scopes namespace to its own name", () => {
    const fork = buildsSource.build(ctx);
    expect(fork.text).toContain("namespace = $3");
    expect(fork.values).toEqual([T0, T0 + 60 * 60 * 1000, "wt-a"]);
    const main = buildsSource.build({ ...ctx, dbName: "singularity", isMainDb: true });
    expect(main.values).toEqual([T0, T0 + 60 * 60 * 1000, "singularity"]);
  });
});
