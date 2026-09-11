import { describe, expect, test } from "bun:test";
import type { ReportRow } from "@plugins/reports/server";
import type { DbQueryDeadlinePayload } from "../../core";
import {
  INCIDENT_DOC,
  renderAbandonCapTask,
  renderQueryDeadlineTask,
} from "./render";

function row(data: Record<string, unknown>): ReportRow {
  const at = new Date("2026-09-11T10:00:00.000Z");
  return {
    id: "rep-1",
    kind: "db-query-deadline",
    fingerprint: "fp",
    worktree: "singularity",
    source: "server-caught",
    message: "m",
    url: null,
    userAgent: null,
    data,
    count: 3,
    rateLimited: false,
    noise: false,
    lastClientId: null,
    lastBuildId: null,
    taskId: null,
    firstSeenAt: at,
    lastSeenAt: at,
    createdAt: at,
    updatedAt: at,
  } as ReportRow;
}

const payload: DbQueryDeadlinePayload = {
  sql: "select count(*) from conversations_v",
  elapsedMs: 60_004,
  deadlineMs: 60_000,
  origin: "push conversations-gone-stats",
  leased: true,
  reason: null,
};

describe("renderQueryDeadlineTask", () => {
  test("states the problem and points at the incident doc", () => {
    const { title, description } = renderQueryDeadlineTask(
      row(payload),
      payload,
    );
    expect(title).toBe(
      "[db] Query got no answer and was abandoned: select count(*) from conversations_v",
    );
    expect(description).toContain("got no answer for 60s");
    expect(description).toContain("**abandoned**");
    expect(description).toContain(INCIDENT_DOC);
    expect(description).toContain(
      "**Ran under:** `push conversations-gone-stats`",
    );
    expect(description).toContain("**Connection:** leased for a transaction");
    expect(description).toContain("**Occurrences:** 3");
    // No scope granted a longer bound, so no line claims one.
    expect(description).not.toContain("Longer deadline granted for");
  });

  test("names a scoped longer bound and an unknown origin", () => {
    const scoped = {
      ...payload,
      elapsedMs: 900_000,
      deadlineMs: 900_000,
      origin: null,
      leased: false,
      reason: "migrations",
    };
    const { description } = renderQueryDeadlineTask(row(scoped), scoped);
    expect(description).toContain("**Waited:** 15 min (deadline 15 min)");
    expect(description).toContain(
      "**Longer deadline granted for:** migrations",
    );
    expect(description).toContain("**Ran under:** unknown");
    expect(description).toContain("**Connection:** a plain pooled query");
  });

  test("clamps a long, multi-line query label to one short title line", () => {
    const long = { ...payload, sql: `select\n  ${"x, ".repeat(60)}y from t` };
    const { title } = renderQueryDeadlineTask(row(long), long);
    expect(title).not.toContain("\n");
    expect(title.endsWith("…")).toBe(true);
    expect(title.length).toBeLessThan(140);
  });
});

describe("renderAbandonCapTask", () => {
  test("says how many, the cap, and what to do", () => {
    const d = { abandoned: 33, cap: 32 };
    const { title, description } = renderAbandonCapTask(row(d), d);
    expect(title).toBe(
      "[db] 33 abandoned database connections — over the cap of 32",
    );
    expect(description).toContain("abandoned 33 database connections");
    expect(description).toContain("restart the backend");
    expect(description).toContain(INCIDENT_DOC);
  });
});
