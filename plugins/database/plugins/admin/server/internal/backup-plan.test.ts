/**
 * The backup's table rule, checked against a hand-built catalog.
 *
 * No database, for the same reason as ./fork-plan.test.ts: `admin` cannot
 * import `db-test-fixture` without closing a cycle. The real round trip — dump
 * with an exclusion, restore, find the table empty — lives in
 * `backup/sources/databases` (`backup-exclusion.test.ts`).
 *
 * Run: `./singularity test plugins/database/plugins/admin`
 */

import { describe, test, expect } from "bun:test";
import { BackupPlanError, planBackupExclusions } from "./backup-plan";
import type { CatalogForeignKey, SchemaCatalog } from "./catalog-plan";

function schema(
  name: string,
  tables: string[],
  partitions: Record<string, string[]> = {},
  foreignKeys: CatalogForeignKey[] = [],
) {
  return {
    name,
    tables,
    partitions,
    foreignKeys,
    bytes: 1_000_000,
    fromExtension: false,
  };
}

function fk(table: string, references: string): CatalogForeignKey {
  return { table, constraint: `${table}_${references}_fk`, references };
}

/** A small mail-shaped cluster: a corpus, the drafts beside it, and a partitioned log. */
function linked(foreignKeys: CatalogForeignKey[]): SchemaCatalog {
  return {
    schemas: [
      schema(
        "public",
        [
          "accounts",
          "threads",
          "messages",
          "drafts",
          "log",
          "log_2026_09",
          "log_2026_10",
          "log_readers",
        ],
        { log: ["log_2026_09", "log_2026_10"] },
        foreignKeys,
      ),
    ],
  };
}

const CATALOG: SchemaCatalog = {
  schemas: [
    schema("graphile_worker", ["_private_jobs", "migrations"]),
    schema(
      "public",
      [
        "tasks",
        "traces",
        "events",
        "events_2026_09",
        "events_2026_10",
        "songIndex",
      ],
      { events: ["events_2026_09", "events_2026_10"] },
    ),
  ],
};

describe("planBackupExclusions", () => {
  test("a declared table gives one quoted pattern", () => {
    const plan = planBackupExclusions(CATALOG, { tables: ["traces"] });
    expect(plan.excludeTableData).toEqual(['"public"."traces"']);
    expect(plan.excludedTables).toEqual(["traces"]);
    expect(plan.unmatched).toEqual([]);
  });

  test("a partitioned table gives the parent plus every leaf", () => {
    const plan = planBackupExclusions(CATALOG, { tables: ["events"] });
    expect(plan.excludeTableData).toEqual([
      '"public"."events"',
      '"public"."events_2026_09"',
      '"public"."events_2026_10"',
    ]);
    expect(plan.excludedTables).toEqual([
      "events",
      "events_2026_09",
      "events_2026_10",
    ]);
  });

  test("a missing table is reported and emits nothing", () => {
    const plan = planBackupExclusions(CATALOG, {
      tables: ["song_index_cache", "traces"],
    });
    expect(plan.excludeTableData).toEqual(['"public"."traces"']);
    expect(plan.excludedTables).toEqual(["traces"]);
    expect(plan.unmatched).toEqual([
      'table "public.song_index_cache" does not exist in the source database',
    ]);
  });

  test("only `public` is searched: a same-named table elsewhere does not match", () => {
    const plan = planBackupExclusions(CATALOG, { tables: ["migrations"] });
    expect(plan.excludeTableData).toEqual([]);
    expect(plan.unmatched).toHaveLength(1);
  });

  test("a mixed-case name is quoted, so pg_dump does not case-fold it", () => {
    const plan = planBackupExclusions(CATALOG, { tables: ["songIndex"] });
    expect(plan.excludeTableData).toEqual(['"public"."songIndex"']);
  });

  test("a database without the app schema reports every declaration", () => {
    const plan = planBackupExclusions(
      { schemas: [schema("graphile_worker", ["migrations"])] },
      { tables: ["traces"] },
    );
    expect(plan.excludeTableData).toEqual([]);
    expect(plan.unmatched).toHaveLength(1);
  });
});

describe("planBackupExclusions — a kept table linking to a left-out one", () => {
  test("is refused, naming the source table, constraint and target", () => {
    const catalog = linked([fk("drafts", "threads")]);
    expect(() =>
      planBackupExclusions(catalog, { tables: ["threads"] }),
    ).toThrow(BackupPlanError);
    expect(() =>
      planBackupExclusions(catalog, { tables: ["threads"] }),
    ).toThrow(
      /table "drafts" links to "threads" through constraint "drafts_threads_fk"[\s\S]*leave the source table out[\s\S]*plain id/,
    );
  });

  test("left out → left out is allowed", () => {
    const plan = planBackupExclusions(linked([fk("messages", "threads")]), {
      tables: ["threads", "messages"],
    });
    expect(plan.excludedTables).toEqual(["threads", "messages"]);
  });

  test("left out → kept is allowed", () => {
    const plan = planBackupExclusions(linked([fk("threads", "accounts")]), {
      tables: ["threads"],
    });
    expect(plan.excludedTables).toEqual(["threads"]);
  });

  test("a self-reference is allowed", () => {
    const plan = planBackupExclusions(linked([fk("threads", "threads")]), {
      tables: ["threads"],
    });
    expect(plan.excludedTables).toEqual(["threads"]);
  });

  test("a link to a partition leaf of a left-out table is refused", () => {
    // The leaf is left out because its parent is declared, so the kept table
    // pointing at it would dangle just the same.
    expect(() =>
      planBackupExclusions(linked([fk("log_readers", "log_2026_09")]), {
        tables: ["log"],
      }),
    ).toThrow(/"log_readers" links to "log_2026_09"/);
  });

  test("a link into an undeclared table is not a finding", () => {
    const plan = planBackupExclusions(linked([fk("drafts", "threads")]), {
      tables: ["log"],
    });
    expect(plan.unmatched).toEqual([]);
  });
});
