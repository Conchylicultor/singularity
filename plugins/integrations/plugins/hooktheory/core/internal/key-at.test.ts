import { describe, expect, it } from "bun:test";
import { hookpadKeyAt } from "./key-at";
import type { HookpadKey } from "./schemas";

const C: HookpadKey = { beat: 1, tonic: "C", scale: "major" };
const G: HookpadKey = { beat: 9, tonic: "G", scale: "major" };
const Am: HookpadKey = { beat: 17, tonic: "A", scale: "minor" };

describe("hookpadKeyAt", () => {
  it("finds the key a beat falls in", () => {
    expect(hookpadKeyAt([C, G, Am], 1)).toEqual({ kind: "found", key: C });
    expect(hookpadKeyAt([C, G, Am], 8.99)).toEqual({ kind: "found", key: C });
    expect(hookpadKeyAt([C, G, Am], 9)).toEqual({ kind: "found", key: G });
    expect(hookpadKeyAt([C, G, Am], 40)).toEqual({ kind: "found", key: Am });
  });

  it("counts a beat within 1e-3 before a change as inside it", () => {
    expect(hookpadKeyAt([C, G], 9 - 5e-4)).toEqual({ kind: "found", key: G });
    expect(hookpadKeyAt([C, G], 9 - 2e-3)).toEqual({ kind: "found", key: C });
  });

  it("takes the last key in document order, not in beat order", () => {
    const repeated: HookpadKey = { beat: 1, tonic: "D", scale: "dorian" };
    expect(hookpadKeyAt([C, repeated], 1)).toEqual({
      kind: "found",
      key: repeated,
    });
    // Out of beat order: G (beat 9) listed after Am (beat 17) still wins at 20.
    expect(hookpadKeyAt([C, Am, G], 20)).toEqual({ kind: "found", key: G });
  });

  it("reports a beat before every key", () => {
    expect(hookpadKeyAt([G], 1)).toEqual({ kind: "before-first-key" });
    expect(hookpadKeyAt([], 1)).toEqual({ kind: "before-first-key" });
  });
});
