import { describe, expect, test } from "bun:test";
import { deriveExitMode, type ExitDecision, type ExitModeInput } from "./exit-mode";

const conversation = { attemptId: "att-1" };
const live = { status: "waiting" } as const;

type SettledData = Extract<ExitDecision, { pending: false }>["data"];

/** The resolved edited-files arm carrying `value`. */
const resolvedFiles = (files: readonly { path: string }[] = []): SettledData["files"] => ({
  resolved: true,
  value: files,
});

const settled = (data: Partial<SettledData> = {}): ExitDecision => ({
  pending: false,
  data: { pushes: [], hasSibling: false, files: resolvedFiles(), ...data },
});

const input = (exitDecision: ExitDecision): ExitModeInput => ({
  conversation,
  live,
  draftEmpty: true,
  exitDecision,
});

describe("deriveExitMode", () => {
  test("pending, no error: neutral provisional Close — never the destructive default", () => {
    expect(deriveExitMode(input({ pending: true, error: null }))).toEqual({
      mode: "exit",
      provisional: true,
    });
  });

  test("pending + error: degraded exit-error, clickable and NOT provisional", () => {
    // The readiness gate folds an errored input into `pending` (a value you can
    // read is one the server vouches for), so an errored decision surfaces on the
    // pending arm — and must NOT stay provisional (that would leave the button
    // stuck disabled forever on a persistent error).
    expect(deriveExitMode(input({ pending: true, error: new Error("worktree missing") }))).toEqual({
      mode: "exit-error",
      provisional: false,
    });
  });

  test("settled, unresolved files: exit-error — the destructive default is unreachable", () => {
    // An unresolved worktree is as undecidable as an errored resource. Surfacing
    // exit-error here (before `files.value` is expressible) is the whole point:
    // "Drop & Close" can no longer be reached on an unknown file set.
    expect(deriveExitMode(input(settled({ files: { resolved: false, reason: "worktree unavailable" } })))).toEqual({
      mode: "exit-error",
      provisional: false,
    });
  });

  test("settled with edited files: Push & Close", () => {
    expect(deriveExitMode(input(settled({ files: resolvedFiles([{ path: "src/a.ts" }]) })))).toEqual({
      mode: "push-and-exit",
      provisional: false,
    });
  });

  test("settled with research-only files: Go", () => {
    expect(deriveExitMode(input(settled({ files: resolvedFiles([{ path: "research/plan.md" }]) })))).toEqual({
      mode: "go",
      provisional: false,
    });
  });

  test("settled, resolved-clean, no push, no sibling: the destructive default is still reachable", () => {
    // The clean-worktree path must keep working: a genuinely empty resolved set
    // (not unknown, not errored) still arms Drop & Close.
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
    const pendingErr: ExitDecision = { pending: true, error: new Error("boom") };
    expect(deriveExitMode({ ...input(pendingErr), draftEmpty: false }).mode).toBe("send");
    expect(
      deriveExitMode({ ...input(pendingErr), live: { status: "working" }, draftEmpty: false }).mode,
    ).toBe("queue");
    expect(deriveExitMode({ ...input(pendingErr), live: { status: "working" } }).mode).toBe("stop");
    expect(deriveExitMode({ ...input(pendingErr), live: { status: "gone" } }).mode).toBe("restore");
    expect(deriveExitMode({ ...input(pendingErr), conversation: null }).mode).toBe("exit");
  });
});
