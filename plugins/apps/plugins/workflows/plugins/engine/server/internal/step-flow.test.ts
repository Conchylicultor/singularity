import { describe, it, expect } from "bun:test";
import { resolveNextStepId, resolveStepOutput } from "./step-flow";
import type { DefinitionStep } from "../../core";

describe("resolveStepOutput", () => {
  it("carries the previous output through a transparent step (no output key)", () => {
    // The branch-discards-the-pipeline regression: routing-only steps return
    // just { branchKey }, and must not null out the data flowing downstream.
    expect(resolveStepOutput({ status: 200 }, { branchKey: "200" })).toEqual({
      status: 200,
    });
  });

  it("carries the previous output through when the result is empty", () => {
    expect(resolveStepOutput("prev", {})).toBe("prev");
  });

  it("overwrites with an explicit output value", () => {
    expect(resolveStepOutput("prev", { output: "new" })).toBe("new");
  });

  it("treats an explicit null output as an overwrite, not a pass-through", () => {
    expect(resolveStepOutput("prev", { output: null })).toBeNull();
  });

  it("a transparent first step passes through the initial null", () => {
    expect(resolveStepOutput(null, { branchKey: "x" })).toBeNull();
  });
});

describe("resolveNextStepId", () => {
  const step = (over: Partial<DefinitionStep>): DefinitionStep => ({
    id: "s1",
    pluginId: "branch",
    label: "Branch",
    config: {},
    next: null,
    nextStepMapping: null,
    ...over,
  });

  it("routes via nextStepMapping when the branchKey matches", () => {
    const def = step({ next: "fallback", nextStepMapping: { yes: "a", no: "b" } });
    expect(resolveNextStepId(def, { branchKey: "yes" })).toBe("a");
  });

  it("falls back to the default next when the branchKey is unmapped", () => {
    const def = step({ next: "fallback", nextStepMapping: { yes: "a" } });
    expect(resolveNextStepId(def, { branchKey: "missing" })).toBe("fallback");
  });

  it("follows the default next when there is no branchKey", () => {
    const def = step({ next: "n1" });
    expect(resolveNextStepId(def, { output: 1 })).toBe("n1");
  });

  it("returns null at the end of the chain", () => {
    expect(resolveNextStepId(step({ next: null }), {})).toBeNull();
  });
});
