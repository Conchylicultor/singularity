/**
 * `runRefReactions` — the in-process half of a ref advance. The behaviours here
 * are the reasons the seam exists at all, so each is pinned rather than assumed.
 */
import { describe, expect, test } from "bun:test";
import { runRefReactions, type RefReactionSpec } from "./reactions";
import type { RefAdvancedPayload } from "../../shared/types";

const MAIN_ADVANCE: RefAdvancedPayload = {
  refName: "refs/heads/main",
  sha: "bbb",
  previousSha: "aaa",
};

describe("runRefReactions", () => {
  test("runs only the reactions registered for the advancing ref", async () => {
    const ran: string[] = [];
    const reactions: RefReactionSpec[] = [
      {
        name: "on-main",
        refName: "refs/heads/main",
        run: async () => {
          ran.push("on-main");
        },
      },
      {
        name: "on-branch",
        refName: "refs/heads/claude-web/att-1",
        run: async () => {
          ran.push("on-branch");
        },
      },
    ];
    await runRefReactions(MAIN_ADVANCE, reactions);
    expect(ran).toEqual(["on-main"]);
  });

  test("hands the reaction the advance, previousSha included", async () => {
    const seen: RefAdvancedPayload[] = [];
    await runRefReactions(MAIN_ADVANCE, [
      {
        name: "capture",
        refName: "refs/heads/main",
        run: async (advance) => {
          seen.push(advance);
        },
      },
    ]);
    expect(seen).toEqual([MAIN_ADVANCE]);
  });

  // The whole point of reporting rather than rethrowing: a broken reaction must
  // not take the watcher's loop — or its siblings, or the durable emit that
  // follows this call — down with it. Correctness is the pull path's job.
  test("a throwing reaction neither propagates nor stops its siblings", async () => {
    const ran: string[] = [];
    const reactions: RefReactionSpec[] = [
      {
        name: "before",
        refName: "refs/heads/main",
        run: async () => {
          ran.push("before");
        },
      },
      {
        name: "boom",
        refName: "refs/heads/main",
        run: async () => {
          throw new Error("kaboom");
        },
      },
      {
        name: "after",
        refName: "refs/heads/main",
        run: async () => {
          ran.push("after");
        },
      },
    ];
    await runRefReactions(MAIN_ADVANCE, reactions);
    expect(ran).toEqual(["before", "after"]);
  });

  test("awaits each reaction before starting the next", async () => {
    const order: string[] = [];
    const reactions: RefReactionSpec[] = [
      {
        name: "slow",
        refName: "refs/heads/main",
        run: async () => {
          await new Promise<void>((r) => setTimeout(r, 5));
          order.push("slow-done");
        },
      },
      {
        name: "fast",
        refName: "refs/heads/main",
        run: async () => {
          order.push("fast-start");
        },
      },
    ];
    await runRefReactions(MAIN_ADVANCE, reactions);
    expect(order).toEqual(["slow-done", "fast-start"]);
  });
});
