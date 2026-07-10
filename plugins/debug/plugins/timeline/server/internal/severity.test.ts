import { describe, expect, test } from "bun:test";
import { buildSeverity, reportSeverity, slowOpSeverity, traceSeverity } from "./severity";

describe("traceSeverity", () => {
  test("critical trigger is an error", () => {
    expect(traceSeverity(true)).toBe("error");
  });
  test("non-critical trip is a warning", () => {
    expect(traceSeverity(false)).toBe("warning");
  });
});

describe("slowOpSeverity", () => {
  test("below 5x threshold is a warning", () => {
    expect(slowOpSeverity(4999, 1000)).toBe("warning");
  });
  test("at or above 5x threshold is an error", () => {
    expect(slowOpSeverity(5000, 1000)).toBe("error");
    expect(slowOpSeverity(471_000, 3000)).toBe("error");
  });
  test("a non-positive threshold can never be an error", () => {
    expect(slowOpSeverity(10_000, 0)).toBe("warning");
  });
});

describe("reportSeverity", () => {
  test("noise rows are info regardless of kind", () => {
    expect(reportSeverity("crash", true)).toBe("info");
  });
  test("crash-like kinds are errors", () => {
    expect(reportSeverity("crash", false)).toBe("error");
    expect(reportSeverity("render-loop", false)).toBe("error");
    expect(reportSeverity("optimistic-divergence", false)).toBe("error");
  });
  test("monitor kinds (and unknown kinds) are warnings", () => {
    expect(reportSeverity("slow-op", false)).toBe("warning");
    expect(reportSeverity("queue-backlog", false)).toBe("warning");
    expect(reportSeverity("some-future-kind", false)).toBe("warning");
  });
});

describe("buildSeverity", () => {
  test("in-flight (null exit code) is info", () => {
    expect(buildSeverity(null)).toBe("info");
  });
  test("clean exit is info", () => {
    expect(buildSeverity(0)).toBe("info");
  });
  test("non-zero exit (including the reconciler's -1) is an error", () => {
    expect(buildSeverity(1)).toBe("error");
    expect(buildSeverity(-1)).toBe("error");
  });
});
