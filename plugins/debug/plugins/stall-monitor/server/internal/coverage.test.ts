import { expect, test, describe } from "bun:test";
import type {
  FlightSpan,
  FlightWindow,
} from "@plugins/infra/plugins/runtime-profiler/core";
import { classifyCoverage } from "./coverage";

// A minimal FlightSpan — only the fields classifyCoverage reads matter; the
// decomposition fields are zero-filled.
function span(partial: Pick<FlightSpan, "kind" | "label" | "t0" | "t1">): FlightSpan {
  const end = partial.t1 ?? 0;
  return {
    id: 1,
    parentId: null,
    waitMs: 0,
    childMs: 0,
    selfMs: 0,
    ageMs: end - partial.t0,
    ...partial,
  };
}

function window(spans: {
  open?: FlightSpan[];
  completed?: FlightSpan[];
  atMs?: number;
}): FlightWindow {
  return {
    atMs: spans.atMs ?? 5000,
    open: spans.open ?? [],
    completed: spans.completed ?? [],
  };
}

describe("classifyCoverage", () => {
  test("no spans → unspanned (the prewarmBundle class)", () => {
    const cov = classifyCoverage(window({}), 4000);
    expect(cov.unspanned).toBe(true);
  });

  test("a covering entry span → spanned + coveringSpan", () => {
    // An http entry span open across the whole freeze (t0 before, still running).
    const fw = window({
      open: [span({ kind: "http", label: "GET /api/x", t0: 500, t1: null })],
      atMs: 5000,
    });
    const cov = classifyCoverage(fw, 4000);
    expect(cov.unspanned).toBe(false);
    if (!cov.unspanned) {
      expect(cov.coveringSpan).toEqual({ kind: "http", label: "GET /api/x" });
    }
  });

  test("only a db leaf spanning → unspanned (db is I/O-waiting, not CPU-covering)", () => {
    const fw = window({
      completed: [span({ kind: "db", label: "SELECT …", t0: 500, t1: 5000 })],
      atMs: 5000,
    });
    const cov = classifyCoverage(fw, 4000);
    expect(cov.unspanned).toBe(true);
  });

  test("a too-short span → unspanned", () => {
    // Freeze is 4000ms; a span covering only ~1s cannot have covered it.
    const fw = window({
      completed: [span({ kind: "loader", label: "loader:tasks", t0: 3900, t1: 5000 })],
      atMs: 5000,
    });
    const cov = classifyCoverage(fw, 4000);
    expect(cov.unspanned).toBe(true);
  });

  test("a completed entry span within the tolerance still covers", () => {
    // 3850ms of a 4000ms freeze — inside the min(200, 10%) slack.
    const fw = window({
      completed: [span({ kind: "loader", label: "loader:tasks", t0: 1000, t1: 4850 })],
      atMs: 5000,
    });
    const cov = classifyCoverage(fw, 4000);
    expect(cov.unspanned).toBe(false);
    if (!cov.unspanned) {
      expect(cov.coveringSpan.kind).toBe("loader");
    }
  });
});
