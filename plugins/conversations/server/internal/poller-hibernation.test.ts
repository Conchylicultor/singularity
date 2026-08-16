import { describe, expect, test } from "bun:test";
import { decideMissingProcessAction } from "./hibernation-decision";

const SESSION = "a4ee9684-418d-4661-b372-2960760538a7";
const onMain = { onMain: true };

describe("decideMissingProcessAction", () => {
  test("resumable + not yet hibernated → hibernate", () => {
    expect(
      decideMissingProcessAction(
        { claudeSessionId: SESSION, hibernatedAt: null },
        onMain,
      ),
    ).toBe("hibernate");
  });

  // An already-hibernated row's process is intentionally absent forever. It must
  // be left alone, never flipped to gone on the next ~1s tick.
  test("already hibernated → leave-hibernated (NOT gone)", () => {
    expect(
      decideMissingProcessAction(
        { claudeSessionId: SESSION, hibernatedAt: new Date(0) },
        onMain,
      ),
    ).toBe("leave-hibernated");
  });

  // The one honest `gone`: no session id means no transcript to resume from.
  test("no resumable session → gone", () => {
    expect(
      decideMissingProcessAction(
        { claudeSessionId: null, hibernatedAt: null },
        onMain,
      ),
    ).toBe("gone");
  });

  test("non-main runtime → leave-unowned, never a status write", () => {
    expect(
      decideMissingProcessAction(
        { claudeSessionId: SESSION, hibernatedAt: null },
        { onMain: false },
      ),
    ).toBe("leave-unowned");
  });

  // Regressions for the bug that reaped live conversations' worktrees: a missing
  // pane must never move status, so the ONLY input that can produce `gone` is an
  // absent claudeSessionId. Conversation status is not even readable here — the
  // signature omits it — so these assert the property at its two live inputs.
  describe("a missing pane never depends on conversation status", () => {
    // Previously `status !== "waiting"` fell through to `gone`, so a reboot or
    // `tmux kill-server` mid-turn marked a working conversation gone, which made
    // `attempts_v.active` false and its git worktree collectable by the reaper.
    test("mid-work rows hibernate like any other resumable row", () => {
      expect(
        decideMissingProcessAction(
          { claudeSessionId: SESSION, hibernatedAt: null },
          onMain,
        ),
      ).toBe("hibernate");
    });

    // A resume whose pane never came up keeps its session id, so it hibernates
    // and stays openable instead of being swept to gone by the starting timeout.
    test("a failed resume still holding its session id hibernates", () => {
      expect(
        decideMissingProcessAction(
          { claudeSessionId: SESSION, hibernatedAt: null },
          onMain,
        ),
      ).toBe("hibernate");
    });
  });

  // `hibernationConfig.enabled` gates the proactive idle-kill job only. Turning
  // it off must not convert "reclaim resources" into "lose the conversation", so
  // it is absent from this decision entirely.
  test("the hibernation config cannot influence the decision", () => {
    const decide = decideMissingProcessAction as unknown as (
      row: { claudeSessionId: string | null; hibernatedAt: Date | null },
      opts: { onMain: boolean; hibernationEnabled?: boolean },
    ) => string;
    const row = { claudeSessionId: SESSION, hibernatedAt: null };
    expect(decide(row, { onMain: true, hibernationEnabled: false })).toBe(
      "hibernate",
    );
    expect(decide(row, { onMain: true, hibernationEnabled: true })).toBe(
      "hibernate",
    );
  });
});
