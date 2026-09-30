import { describe, expect, test } from "bun:test";
import type { BackgroundEntryDraft } from "../core";
import { mergeCatalog } from "./merge";

function draft(
  name: string,
  over: Partial<BackgroundEntryDraft> = {},
): BackgroundEntryDraft {
  return {
    name,
    description: `Does ${name}.`,
    group: "Scheduled",
    trigger: { kind: "on-demand" },
    scope: "every-worktree",
    runsHere: true,
    declaredIn: null,
    lastRun: null,
    history: null,
    canRunNow: false,
    internal: false,
    facts: [],
    ...over,
  };
}

describe("mergeCatalog", () => {
  test("stamps every entry with its provider's kind", () => {
    const merged = mergeCatalog([
      { kind: "job", entries: [draft("a")] },
      { kind: "warmup", entries: [draft("b")] },
    ]);
    expect(merged.map((e) => [e.kind, e.name])).toEqual([
      ["job", "a"],
      ["warmup", "b"],
    ]);
  });

  test("the same name under two kinds is two entries", () => {
    const merged = mergeCatalog([
      { kind: "job", entries: [draft("x")] },
      { kind: "timer", entries: [draft("x")] },
    ]);
    expect(merged).toHaveLength(2);
  });

  test("a name listed twice within one kind is refused", () => {
    expect(() =>
      mergeCatalog([{ kind: "job", entries: [draft("x"), draft("x")] }]),
    ).toThrow(/listed "x" twice/);
  });

  test("keeps groups in first-appearance order, then sorts by description", () => {
    const merged = mergeCatalog([
      {
        kind: "job",
        entries: [
          draft("z", { group: "Scheduled", description: "Beta" }),
          draft("y", { group: "Cleanup", description: "Zeta" }),
          draft("w", { group: "Scheduled", description: "Alpha" }),
        ],
      },
    ]);
    expect(merged.map((e) => e.name)).toEqual(["w", "z", "y"]);
  });

  test("no provider is an empty catalog", () => {
    expect(mergeCatalog([])).toEqual([]);
  });
});
