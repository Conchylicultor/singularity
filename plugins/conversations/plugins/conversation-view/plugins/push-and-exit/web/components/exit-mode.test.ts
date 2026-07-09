import { describe, expect, test } from "bun:test";
import { deriveExitMode, type ExitDecision, type ExitModeInput } from "./exit-mode";

const conversation = { attemptId: "att-1" };
const live = { status: "waiting" } as const;

const settled = (
  data: Partial<Extract<ExitDecision, { pending: false }>["data"]> = {},
  error: Error | null = null,
): ExitDecision => ({
  pending: false,
  error,
  data: { pushes: [], hasSibling: false, files: [], ...data },
});

const input = (exitDecision: ExitDecision): ExitModeInput => ({
  conversation,
  live,
  draftEmpty: true,
  exitDecision,
});

describe("deriveExitMode", () => {
  test("pending: neutral, provisional Close — never the destructive default", () => {
    expect(deriveExitMode(input({ pending: true, error: null }))).toEqual({
      mode: "exit",
      provisional: true,
    });
  });

  test("error: degraded exit-error, clickable — an errored resource is not an empty one", () => {
    // A settled-but-errored decision carries the descriptors' initial data
    // (`pushes: []`, `hasSibling: false`, `files: []`) — byte-identical to a
    // clean worktree with no push and no sibling, which would otherwise arm
    // "Drop & Close".
    expect(deriveExitMode(input(settled({}, new Error("worktree missing"))))).toEqual({
      mode: "exit-error",
      provisional: false,
    });
    expect(deriveExitMode(input({ pending: true, error: new Error("x") }))).toEqual({
      mode: "exit",
      provisional: true,
    });
  });

  test("settled with edited files: Push & Close", () => {
    expect(deriveExitMode(input(settled({ files: [{ path: "src/a.ts" }] })))).toEqual({
      mode: "push-and-exit",
      provisional: false,
    });
  });

  test("settled with research-only files: Go", () => {
    expect(deriveExitMode(input(settled({ files: [{ path: "research/plan.md" }] })))).toEqual({
      mode: "go",
      provisional: false,
    });
  });

  test("settled, clean, no push, no sibling: the destructive default is still reachable", () => {
    expect(deriveExitMode(input(settled()))).toEqual({
      mode: "drop-and-exit",
      provisional: false,
    });
  });

  test("settled, clean, with a push or a sibling: plain Close", () => {
    expect(deriveExitMode(input(settled({ pushes: [{ attemptId: "att-1" }] })))).toEqual({
      mode: "exit",
      provisional: false,
    });
    expect(deriveExitMode(input(settled({ hasSibling: true })))).toEqual({
      mode: "exit",
      provisional: false,
    });
  });

  test("the exit decision is only consulted once the conversation is idle with an empty draft", () => {
    const errored = settled({}, new Error("boom"));
    expect(deriveExitMode({ ...input(errored), draftEmpty: false }).mode).toBe("send");
    expect(
      deriveExitMode({ ...input(errored), live: { status: "working" }, draftEmpty: false }).mode,
    ).toBe("queue");
    expect(deriveExitMode({ ...input(errored), live: { status: "working" } }).mode).toBe("stop");
    expect(deriveExitMode({ ...input(errored), live: { status: "gone" } }).mode).toBe("restore");
    expect(deriveExitMode({ ...input(errored), conversation: null }).mode).toBe("exit");
  });
});
