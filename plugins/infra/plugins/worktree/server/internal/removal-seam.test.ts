import { describe, expect, test } from "bun:test";
import {
  beginInAppRemoval,
  finishInAppRemoval,
  recentInAppRemovals,
  withCheckoutClaim,
} from "./removal-seam";

// The ring is module-global, so every test uses its own ids and looks its
// records up by id rather than asserting on the whole ring.
const WINDOW_MS = 10 * 60 * 1000;

function claimsFor(id: string, now?: number) {
  return recentInAppRemovals(WINDOW_MS, now).filter((r) => r.id === id);
}

describe("recentInAppRemovals", () => {
  test("a running removal claims however long it has been running", () => {
    const record = beginInAppRemoval(
      "/repo/.claude/worktrees/att-seam-running",
    );
    expect(
      claimsFor("att-seam-running", record.startedAt + 10 * WINDOW_MS),
    ).toHaveLength(1);
  });

  test("an ended removal claims only within the window after it ended", () => {
    const record = beginInAppRemoval("/repo/.claude/worktrees/att-seam-ended");
    finishInAppRemoval(record, { ok: true });
    const endedAt = record.endedAt;
    if (endedAt === null)
      throw new Error("finishInAppRemoval must set endedAt");
    expect(claimsFor("att-seam-ended", endedAt + WINDOW_MS)).toHaveLength(1);
    expect(claimsFor("att-seam-ended", endedAt + WINDOW_MS + 1)).toHaveLength(
      0,
    );
  });
});

describe("withCheckoutClaim", () => {
  test("claims the path while the checkout runs", async () => {
    const path = "/repo/.claude/worktrees/att-seam-inflight";
    await withCheckoutClaim(path, async () => {
      const [claim] = claimsFor("att-seam-inflight");
      expect(claim?.branch).toBe("checkout-rollback");
      expect(claim?.endedAt).toBeNull();
    });
  });

  // A claim left standing after a successful checkout would let an outside
  // deletion of that fresh checkout pass as our own rollback.
  test("drops the claim when the checkout succeeds", async () => {
    const value = await withCheckoutClaim(
      "/repo/.claude/worktrees/att-seam-ok",
      async () => 42,
    );
    expect(value).toBe(42);
    expect(claimsFor("att-seam-ok")).toHaveLength(0);
  });

  test("keeps an ended claim and rethrows when the checkout fails", async () => {
    const failure = new Error("git worktree add failed (exit 143)");
    let thrown: unknown;
    try {
      await withCheckoutClaim(
        "/repo/.claude/worktrees/att-seam-fail",
        async () => {
          throw failure;
        },
      );
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBe(failure);
    const [claim] = claimsFor("att-seam-fail");
    expect(claim?.branch).toBe("checkout-rollback");
    expect(claim?.endedAt).not.toBeNull();
  });
});
