import { describe, expect, test } from "bun:test";
import {
  VISIT_IDLE_TIMEOUT_MS,
  continuesVisit,
  liveVisitCutoff,
} from "./visit-grouping";

const now = new Date("2026-09-16T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("visit grouping", () => {
  test("a hit within 30 minutes continues the visit", () => {
    expect(continuesVisit(ago(0), now)).toBe(true);
    expect(continuesVisit(ago(29 * 60 * 1000), now)).toBe(true);
    expect(continuesVisit(ago(VISIT_IDLE_TIMEOUT_MS - 1), now)).toBe(true);
  });
  test("a gap of exactly 30 minutes or more starts a new visit", () => {
    expect(continuesVisit(ago(VISIT_IDLE_TIMEOUT_MS), now)).toBe(false);
    expect(continuesVisit(ago(2 * 60 * 60 * 1000), now)).toBe(false);
  });
  test("the SQL cutoff is the same boundary", () => {
    expect(liveVisitCutoff(now).toISOString()).toBe("2026-09-16T11:30:00.000Z");
  });
});
