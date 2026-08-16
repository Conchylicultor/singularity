import { describe, expect, test } from "bun:test";
import type { InAppRemovalRecord } from "@plugins/infra/plugins/worktree/server";
import { classifyDisappearance, diffVanished } from "./classify";

function removal(over: Partial<InAppRemovalRecord> = {}): InAppRemovalRecord {
  return {
    id: "att-1-aaaa",
    path: "/repo/.claude/worktrees/att-1-aaaa",
    pid: 100,
    startedAt: 1_000,
    branch: "git-worktree-remove",
    ...over,
  };
}

describe("diffVanished", () => {
  test("reports names present before and absent after", () => {
    expect(diffVanished(new Set(["a", "b", "c"]), new Set(["a", "c"]))).toEqual(
      ["b"],
    );
  });

  test("ignores newly created checkouts", () => {
    expect(diffVanished(new Set(["a"]), new Set(["a", "new"]))).toEqual([]);
  });

  test("no change yields nothing", () => {
    expect(diffVanished(new Set(["a", "b"]), new Set(["b", "a"]))).toEqual([]);
  });

  test("reports every name when the whole set goes, sorted", () => {
    expect(diffVanished(new Set(["b", "a"]), new Set())).toEqual(["a", "b"]);
  });
});

describe("classifyDisappearance", () => {
  test("no in-app removal claims it -> external", () => {
    const verdict = classifyDisappearance("att-1-aaaa", []);
    expect(verdict.attribution).toBe("external");
    expect(verdict.claimedBy).toBeNull();
  });

  test("a matching in-app removal claims it", () => {
    const verdict = classifyDisappearance("att-1-aaaa", [removal()]);
    expect(verdict.attribution).toBe("in-app");
    expect(verdict.claimedBy?.pid).toBe(100);
  });

  // The regression that matters: a removal of a DIFFERENT worktree must never
  // absorb this one, or one legitimate reap would mask an external deletion
  // happening in the same window.
  test("a removal of another worktree does not claim it", () => {
    const verdict = classifyDisappearance("att-2-bbbb", [
      removal({ id: "att-1-aaaa" }),
    ]);
    expect(verdict.attribution).toBe("external");
    expect(verdict.claimedBy).toBeNull();
  });

  test("the most recent claimant wins when an id was removed twice", () => {
    const verdict = classifyDisappearance("att-1-aaaa", [
      removal({ startedAt: 1_000, pid: 100 }),
      removal({ startedAt: 5_000, pid: 200 }),
    ]);
    expect(verdict.claimedBy?.pid).toBe(200);
  });

  test("an unfinished removal (no branch chosen yet) still claims it", () => {
    const verdict = classifyDisappearance("att-1-aaaa", [
      removal({ branch: null }),
    ]);
    expect(verdict.attribution).toBe("in-app");
    expect(verdict.claimedBy?.branch).toBeNull();
  });
});
