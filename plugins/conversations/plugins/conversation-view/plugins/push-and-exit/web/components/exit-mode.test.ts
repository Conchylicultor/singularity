import { describe, expect, test } from "bun:test";
import type { AttemptWork } from "@plugins/tasks/plugins/attempt-work/core";
import {
  deriveExitMode,
  type ExitDecision,
  type ExitModeInput,
} from "./exit-mode";

const conversation = { attemptId: "att-1" };
const live = { status: "waiting" } as const;

type SettledData = Extract<ExitDecision, { pending: false }>["data"];

/** The resolved edited-files arm carrying `value`. */
const resolvedFiles = (
  files: readonly { path: string }[] = [],
): SettledData["files"] => ({
  resolved: true,
  value: files,
});

/**
 * The resolved attempt-standing arm. Defaults to a measured "nothing at stake":
 * the branch exists, is level with `main`, and nothing of this attempt's has
 * landed — which is the only state that may arm the destructive drop.
 */
const resolvedWork = (
  work: Partial<AttemptWork> = {},
): SettledData["work"] => ({
  resolved: true,
  value: {
    pending: {
      kind: "measured",
      ahead: 0,
      behind: 0,
      branch: "claude-web/att-1",
      mergeBase: "abc",
    },
    landedCommits: 0,
    landedPushes: 0,
    ledgerPushes: 0,
    ...work,
  },
});

const settled = (data: Partial<SettledData> = {}): ExitDecision => ({
  pending: false,
  data: {
    work: resolvedWork(),
    hasSibling: false,
    files: resolvedFiles(),
    ...data,
  },
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
    expect(
      deriveExitMode(
        input({ pending: true, error: new Error("worktree missing") }),
      ),
    ).toEqual({
      mode: "exit-error",
      provisional: false,
    });
  });

  test("settled, unresolved files: exit-error — the destructive default is unreachable", () => {
    // An unresolved worktree is as undecidable as an errored resource. Surfacing
    // exit-error here (before `files.value` is expressible) is the whole point:
    // "Drop & Close" can no longer be reached on an unknown file set.
    expect(
      deriveExitMode(
        input(
          settled({
            files: { resolved: false, reason: "worktree unavailable" },
          }),
        ),
      ),
    ).toEqual({
      mode: "exit-error",
      provisional: false,
    });
  });

  test("settled with edited files: Push & Close", () => {
    expect(
      deriveExitMode(
        input(settled({ files: resolvedFiles([{ path: "src/a.ts" }]) })),
      ),
    ).toEqual({
      mode: "push-and-exit",
      provisional: false,
    });
  });

  test("settled with research-only files: Go", () => {
    expect(
      deriveExitMode(
        input(
          settled({ files: resolvedFiles([{ path: "research/plan.md" }]) }),
        ),
      ),
    ).toEqual({
      mode: "go",
      provisional: false,
    });
  });

  test("clean worktree, commits ahead of main: Push & Close, never Drop", () => {
    // The committed-but-never-pushed defect. Nothing is uncommitted, so the file
    // set is legitimately empty — but real commits sit on the branch, and offering
    // to drop the task would throw them away.
    expect(
      deriveExitMode(
        input(
          settled({
            work: resolvedWork({
              pending: {
                kind: "measured",
                ahead: 3,
                behind: 0,
                branch: "claude-web/att-1",
                mergeBase: "abc",
              },
            }),
          }),
        ),
      ),
    ).toEqual({ mode: "push-and-exit", provisional: false });
  });

  test("clean worktree, work already in main: plain Close", () => {
    // The reproduction: a branch that was merged into `main`. Nothing is left to
    // push and nothing may be dropped.
    expect(
      deriveExitMode(
        input(
          settled({
            work: resolvedWork({ landedCommits: 2, landedPushes: 1 }),
          }),
        ),
      ),
    ).toEqual({ mode: "exit", provisional: false });
  });

  test("a push row alone still counts as landed", () => {
    // Pre-trailer-era attempts: their commits carry no conversation trailer to
    // grep for, so git measures no landed commits. A recorded push row PROVES a
    // push happened, so it is ORed in — the one direction the ledger is read.
    expect(
      deriveExitMode(
        input(
          settled({
            work: resolvedWork({ landedCommits: 0, ledgerPushes: 1 }),
          }),
        ),
      ),
    ).toEqual({ mode: "exit", provisional: false });
  });

  test("measured 'nothing at stake', no sibling: the destructive default is still reachable", () => {
    // The drop affordance must survive this change: an attempt git measured as
    // having no work — not unknown, not errored — still arms Drop & Close.
    expect(deriveExitMode(input(settled()))).toEqual({
      mode: "drop-and-exit",
      provisional: false,
    });
  });

  test("measured 'nothing at stake' with an active sibling: plain Close", () => {
    expect(deriveExitMode(input(settled({ hasSibling: true })))).toEqual({
      mode: "exit",
      provisional: false,
    });
  });

  test("settled, unresolved work: exit-error — an unmeasurable standing never drops", () => {
    // Nobody could measure where this attempt stands, so the destructive action
    // is off the table exactly as it is for an unresolved file set.
    expect(
      deriveExitMode(
        input(
          settled({ work: { resolved: false, reason: "attempt row is gone" } }),
        ),
      ),
    ).toEqual({ mode: "exit-error", provisional: false });
  });

  test("unresolved work with edited files: still Push & Close", () => {
    // Pins the ordering. Uncommitted edits decide the mode on their own, so an
    // unmeasurable standing degrades only the cases that depend on it — a dirty
    // worktree still gets the actionable "Push & Close", not "state unknown".
    expect(
      deriveExitMode(
        input(
          settled({
            work: { resolved: false, reason: "attempt row is gone" },
            files: resolvedFiles([{ path: "src/a.ts" }]),
          }),
        ),
      ),
    ).toEqual({ mode: "push-and-exit", provisional: false });
  });

  test("the exit decision is only consulted once the conversation is idle with an empty draft", () => {
    const pendingErr: ExitDecision = {
      pending: true,
      error: new Error("boom"),
    };
    expect(
      deriveExitMode({ ...input(pendingErr), draftEmpty: false }).mode,
    ).toBe("send");
    expect(
      deriveExitMode({
        ...input(pendingErr),
        live: { status: "working" },
        draftEmpty: false,
      }).mode,
    ).toBe("queue");
    expect(
      deriveExitMode({ ...input(pendingErr), live: { status: "working" } })
        .mode,
    ).toBe("stop");
    expect(
      deriveExitMode({ ...input(pendingErr), live: { status: "gone" } }).mode,
    ).toBe("restore");
    expect(
      deriveExitMode({ ...input(pendingErr), conversation: null }).mode,
    ).toBe("exit");
  });
});
