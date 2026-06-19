import { describe, expect, test } from "bun:test";
import { decideMissingProcessAction } from "./hibernation-decision";

const SESSION = "a4ee9684-418d-4661-b372-2960760538a7";
const onMainEnabled = { onMain: true, hibernationEnabled: true };

describe("decideMissingProcessAction", () => {
  test("waiting + resumable + not yet hibernated → hibernate", () => {
    expect(
      decideMissingProcessAction(
        { status: "waiting", claudeSessionId: SESSION, hibernatedAt: null },
        onMainEnabled,
      ),
    ).toBe("hibernate");
  });

  // The regression: an already-hibernated row's process is intentionally absent
  // forever. It must be left alone, never flipped to gone/disconnected on the
  // next tick.
  test("already hibernated → leave-hibernated (NOT gone)", () => {
    expect(
      decideMissingProcessAction(
        { status: "waiting", claudeSessionId: SESSION, hibernatedAt: new Date(0) },
        onMainEnabled,
      ),
    ).toBe("leave-hibernated");
  });

  test("no resumable session → gone", () => {
    expect(
      decideMissingProcessAction(
        { status: "waiting", claudeSessionId: null, hibernatedAt: null },
        onMainEnabled,
      ),
    ).toBe("gone");
  });

  test("mid-work (not waiting) → gone", () => {
    expect(
      decideMissingProcessAction(
        { status: "working", claudeSessionId: SESSION, hibernatedAt: null },
        onMainEnabled,
      ),
    ).toBe("gone");
  });

  test("hibernation disabled → gone", () => {
    expect(
      decideMissingProcessAction(
        { status: "waiting", claudeSessionId: SESSION, hibernatedAt: null },
        { onMain: true, hibernationEnabled: false },
      ),
    ).toBe("gone");
  });

  test("non-main runtime → gone", () => {
    expect(
      decideMissingProcessAction(
        { status: "waiting", claudeSessionId: SESSION, hibernatedAt: null },
        { onMain: false, hibernationEnabled: true },
      ),
    ).toBe("gone");
  });
});
