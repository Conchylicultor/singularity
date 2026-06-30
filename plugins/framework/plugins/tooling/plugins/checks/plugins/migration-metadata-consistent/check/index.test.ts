import { describe, expect, test } from "bun:test";
import { classifyMigrationMetadata } from "./index";

describe("classifyMigrationMetadata", () => {
  test("fully consistent tree -> all empty", () => {
    // J === S; every snapshot maps to a journal entry; one snapshot-less data
    // migration (data_backfill) is in J/S but not N — and must NOT be flagged.
    const journal = ["20260101_a__schema", "20260102_b__data_backfill"];
    const sql = ["20260101_a__schema", "20260102_b__data_backfill"];
    const snapshots = ["20260101_a__schema"];
    expect(classifyMigrationMetadata(journal, sql, snapshots)).toEqual({
      orphanSql: [],
      orphanJournal: [],
      orphanSnapshot: [],
    });
  });

  test("orphan sql (.sql with no journal entry)", () => {
    const journal = ["20260101_a__schema"];
    const sql = ["20260101_a__schema", "20260102_b__orphan"];
    const snapshots = ["20260101_a__schema"];
    expect(classifyMigrationMetadata(journal, sql, snapshots)).toEqual({
      orphanSql: ["20260102_b__orphan"],
      orphanJournal: [],
      orphanSnapshot: [],
    });
  });

  test("orphan journal (journal entry with no .sql)", () => {
    const journal = ["20260101_a__schema", "20260102_b__ghost"];
    const sql = ["20260101_a__schema"];
    const snapshots = ["20260101_a__schema"];
    expect(classifyMigrationMetadata(journal, sql, snapshots)).toEqual({
      orphanSql: [],
      orphanJournal: ["20260102_b__ghost"],
      orphanSnapshot: [],
    });
  });

  test("orphan snapshot (snapshot with no journal entry / no .sql)", () => {
    const journal = ["20260101_a__schema"];
    const sql = ["20260101_a__schema"];
    const snapshots = ["20260101_a__schema", "20260102_b__ghost"];
    expect(classifyMigrationMetadata(journal, sql, snapshots)).toEqual({
      orphanSql: [],
      orphanJournal: [],
      orphanSnapshot: ["20260102_b__ghost"],
    });
  });

  test("snapshot-less data migration is NOT flagged (tag in J and S but not N)", () => {
    const journal = ["20260102_b__data_backfill"];
    const sql = ["20260102_b__data_backfill"];
    const snapshots: string[] = [];
    expect(classifyMigrationMetadata(journal, sql, snapshots)).toEqual({
      orphanSql: [],
      orphanJournal: [],
      orphanSnapshot: [],
    });
  });
});
