import { describe, expect, test } from "bun:test";
import type {
  PrototypeHistory,
  PrototypeVersion,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";
import {
  isPastStep,
  shaForStep,
  stepBy,
  stepLabel,
  versionSteps,
} from "./version-steps";

function version(n: number): PrototypeVersion {
  return {
    n,
    sha: `sha${n}`,
    at: "2026-09-11T10:00:00.000Z",
    kind: n === 0 ? "baseline" : "turn",
    subject: `request ${n}`,
    conversationId: null,
    messageId: null,
  };
}

function history(count: number, dirty: boolean): PrototypeHistory {
  return {
    versions: Array.from({ length: count }, (_, i) => version(i)),
    dirty,
  };
}

function labels(h: PrototypeHistory, shown: string | null = null): string[] {
  const model = versionSteps(h, shown);
  return model.steps.map((s) => stepLabel(s, model.newestN));
}

describe("versionSteps", () => {
  test("clean: one stop per version, the newest is live", () => {
    const model = versionSteps(history(3, false), null);
    expect(labels(history(3, false))).toEqual([
      "v0 of 2",
      "v1 of 2",
      "v2 · Latest",
    ]);
    expect(model.current).toBe(2);
    expect(model.steps.map(shaForStep)).toEqual(["sha0", "sha1", null]);
  });

  test("dirty: an unsaved stop past the newest, which becomes a past version", () => {
    const model = versionSteps(history(3, true), null);
    expect(labels(history(3, true))).toEqual([
      "v0 of 2",
      "v1 of 2",
      "v2 of 2",
      "Live · unsaved",
    ]);
    expect(model.current).toBe(3);
    expect(model.steps.map(shaForStep)).toEqual(["sha0", "sha1", "sha2", null]);
    expect(model.steps.map(isPastStep)).toEqual([true, true, true, false]);
  });

  test("only the baseline: one live stop, no way to step", () => {
    const model = versionSteps(history(1, false), null);
    expect(labels(history(1, false))).toEqual(["v0 · Latest"]);
    expect(stepBy(model, -1)).toBeNull();
    expect(stepBy(model, 1)).toBeNull();
  });

  test("a shown sha lands on its own stop", () => {
    const model = versionSteps(history(4, false), "sha1");
    expect(model.current).toBe(1);
    const prev = stepBy(model, -1);
    const next = stepBy(model, 1);
    expect(prev && shaForStep(prev)).toBe("sha0");
    expect(next && shaForStep(next)).toBe("sha2");
  });

  test("showing the newest of a clean folder IS the live stop", () => {
    const model = versionSteps(history(3, false), "sha2");
    expect(model.current).toBe(2);
    expect(isPastStep(model.steps[2]!)).toBe(false);
  });

  test("showing the newest of a dirty folder steps forward to unsaved", () => {
    const model = versionSteps(history(3, true), "sha2");
    expect(model.current).toBe(2);
    const next = stepBy(model, 1);
    expect(next?.kind).toBe("unsaved");
    expect(next && shaForStep(next)).toBeNull();
  });

  test("a sha the history does not hold is lost; forward returns to live", () => {
    const model = versionSteps(history(3, true), "gone");
    expect(model.current).toBeNull();
    expect(stepBy(model, -1)).toBeNull();
    expect(stepBy(model, 1)?.kind).toBe("unsaved");
  });

  test("the ends are closed", () => {
    const first = versionSteps(history(3, false), "sha0");
    expect(stepBy(first, -1)).toBeNull();
    const last = versionSteps(history(3, false), null);
    expect(stepBy(last, 1)).toBeNull();
  });

  test("an empty history is a broken store, not zero versions", () => {
    expect(() => versionSteps({ versions: [], dirty: false }, null)).toThrow();
  });
});
