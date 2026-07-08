import { describe, expect, test } from "bun:test";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { defineRetention, markFirehose } from "@plugins/infra/plugins/retention/server";
import {
  evaluateFirehoseCoverage,
  getFirehoseEntries,
  getRetentionCoveredTables,
  type FirehoseEntry,
} from "../shared/internal/firehose-registry";
import check from "./index";

const fh = (table: string, cascadeOwner = false): FirehoseEntry => ({
  table,
  cascadeOwner,
});

describe("evaluateFirehoseCoverage (pure)", () => {
  test("an empty firehose set passes trivially", () => {
    expect(evaluateFirehoseCoverage([], new Set())).toEqual({ ok: true });
  });

  test("a firehose table with a retention policy is covered", () => {
    expect(
      evaluateFirehoseCoverage([fh("_reports")], new Set(["_reports"])),
    ).toEqual({ ok: true });
  });

  test("a firehose table declared cascade-owner is covered", () => {
    expect(
      evaluateFirehoseCoverage([fh("child_rows", true)], new Set()),
    ).toEqual({ ok: true });
  });

  test("a firehose table with neither retention nor cascade fails", () => {
    expect(
      evaluateFirehoseCoverage([fh("entity_versions")], new Set()),
    ).toEqual({ ok: false, uncovered: ["entity_versions"] });
  });

  test("reports only the uncovered tables, sorted", () => {
    const result = evaluateFirehoseCoverage(
      [fh("zzz"), fh("aaa"), fh("covered"), fh("cascade", true)],
      new Set(["covered"]),
    );
    expect(result).toEqual({ ok: false, uncovered: ["aaa", "zzz"] });
  });
});

// Throwaway physical schemas (no live DB) — only the table NAMES matter here.
const swept = pgTable("retention_test_swept", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at").notNull(),
});
const firehoseSwept = pgTable("retention_test_firehose_swept", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at").notNull(),
});
const firehoseNoBound = pgTable("retention_test_firehose_no_bound", {
  id: text("id").primaryKey(),
});

describe("defineRetention / markFirehose registry wiring", () => {
  test("defineRetention builds a deterministically-named retention job and records coverage", () => {
    const job = defineRetention({ table: swept, ttlDays: 7 });
    expect(job.name).toBe("retention.retention_test_swept");
    expect(getRetentionCoveredTables().has("retention_test_swept")).toBe(true);
    // A plain retention (no firehose flag) is not itself a firehose entry.
    expect(getFirehoseEntries().some((e) => e.table === "retention_test_swept")).toBe(
      false,
    );
  });

  test("defineRetention({ firehose: true }) is a firehose that is covered by its own policy", () => {
    defineRetention({ table: firehoseSwept, ttlDays: 7, firehose: true });
    const covered = evaluateFirehoseCoverage(
      getFirehoseEntries(),
      getRetentionCoveredTables(),
    );
    if (!covered.ok) {
      expect(covered.uncovered).not.toContain("retention_test_firehose_swept");
    }
  });

  test("throws loudly when the retention column is missing", () => {
    expect(() => defineRetention({ table: firehoseNoBound, ttlDays: 7 })).toThrow(
      /no column "createdAt"/,
    );
  });

  test("markFirehose without a bound makes the check fail and names the table", async () => {
    markFirehose(firehoseNoBound); // no retention, no cascade → unbounded
    const result = await check.run();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("retention_test_firehose_no_bound");
    }
  });

  test("markFirehose(..., { cascadeOwner: true }) is bounded", () => {
    const owned = pgTable("retention_test_cascade_child", { id: text("id").primaryKey() });
    markFirehose(owned, { cascadeOwner: true });
    const covered = evaluateFirehoseCoverage(
      getFirehoseEntries(),
      getRetentionCoveredTables(),
    );
    if (!covered.ok) {
      expect(covered.uncovered).not.toContain("retention_test_cascade_child");
    }
  });
});
