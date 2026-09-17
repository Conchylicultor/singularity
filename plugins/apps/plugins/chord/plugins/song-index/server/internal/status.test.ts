import { describe, expect, it } from "bun:test";
import { type IndexStateView, indexStatus, isIndexCurrent } from "./status";

const TARGET = {
  snapshotName: "sheetsage-a-b-v1",
  scope: "sample" as const,
  derivationVersion: 1,
};

function state(overrides: Partial<IndexStateView> = {}): IndexStateView {
  return {
    ...TARGET,
    phase: "ready",
    done: 1300,
    total: 1300,
    windows: 9000,
    error: null,
    ...overrides,
  };
}

describe("isIndexCurrent", () => {
  it("is current only when ready at the same snapshot, scope and derivation version", () => {
    expect(isIndexCurrent(state(), TARGET)).toBe(true);
    expect(isIndexCurrent(null, TARGET)).toBe(false);
    expect(isIndexCurrent(state({ phase: "loading" }), TARGET)).toBe(false);
    expect(isIndexCurrent(state({ phase: "failed" }), TARGET)).toBe(false);
    expect(isIndexCurrent(state({ scope: "full" }), TARGET)).toBe(false);
    expect(isIndexCurrent(state({ derivationVersion: 0 }), TARGET)).toBe(false);
    expect(isIndexCurrent(state({ snapshotName: "other" }), TARGET)).toBe(
      false,
    );
  });
});

describe("indexStatus", () => {
  it("is not-requested without a request, whatever the state", () => {
    expect(indexStatus(false, null)).toEqual({ kind: "not-requested" });
    expect(indexStatus(false, state())).toEqual({ kind: "not-requested" });
  });

  it("is queued when requested and no load has started", () => {
    expect(indexStatus(true, null)).toEqual({
      kind: "loading",
      phase: "queued",
      done: null,
      total: null,
    });
  });

  it("reports each phase", () => {
    expect(
      indexStatus(
        true,
        state({ phase: "downloading", done: null, total: null }),
      ),
    ).toEqual({
      kind: "loading",
      phase: "downloading",
      done: null,
      total: null,
    });
    expect(
      indexStatus(true, state({ phase: "loading", done: 200, total: 1300 })),
    ).toEqual({
      kind: "loading",
      phase: "loading",
      done: 200,
      total: 1300,
    });
    expect(indexStatus(true, state())).toEqual({
      kind: "ready",
      scope: "sample",
      sections: 1300,
      windows: 9000,
    });
    expect(
      indexStatus(true, state({ phase: "failed", error: "HTTP 404" })),
    ).toEqual({
      kind: "failed",
      error: "HTTP 404",
    });
  });

  it("throws on a ready row with no counts", () => {
    expect(() => indexStatus(true, state({ windows: null }))).toThrow(
      /windows count is null/,
    );
  });
});
