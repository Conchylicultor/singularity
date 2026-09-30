import { describe, expect, test } from "bun:test";
import {
  renderMergeSnapshotMigration,
  renderPhasedMigration,
} from "@plugins/database/plugins/migrations/core";
import { planMigrations, planSchemaSteps, type Migration } from "./runner";

// Build a Migration inline, mirroring listMigrationFiles's shape.
function mig(
  date: string,
  time: string,
  hash: string,
  slug: string,
  sql: string,
): Migration {
  return {
    file: `${date}_${time}_${hash}__${slug}.sql`,
    hash,
    sortKey: `${date}${time}`,
    sqlText: sql,
  };
}

describe("planMigrations", () => {
  test("two byte-identical-hash files (the real bug): the second is a same-run duplicate", () => {
    // Exactly the improve_pending_queue_top case: an add migration that recurs
    // byte-identical at a later timestamp (DDL elided — planMigrations ignores
    // sqlText; what matters is that both files carry the same sha8).
    const ddl = `-- identical recurring DDL`;
    const first = mig(
      "20260501",
      "182228",
      "2a407315",
      "add_improve_pending_queue_top",
      ddl,
    );
    const second = mig(
      "20260503",
      "222323",
      "2a407315",
      "add_improve_pending_queue_top",
      ddl,
    );

    const { toApply, skippedDuplicates } = planMigrations(
      [first, second],
      new Set(),
    );

    expect(toApply).toEqual([first]);
    expect(skippedDuplicates).toEqual([
      { file: second.file, original: first.file },
    ]);
  });

  test("a hash already in appliedHashes is a normal prior-boot skip, not a collision", () => {
    const a = mig("20260101", "000000", "aaaaaaaa", "a", "SELECT 1");
    const b = mig("20260102", "000000", "bbbbbbbb", "b", "SELECT 2");

    const { toApply, skippedDuplicates } = planMigrations(
      [a, b],
      new Set(["aaaaaaaa"]),
    );

    // `a` is excluded from toApply (already applied)...
    expect(toApply).toEqual([b]);
    // ...and is NOT reported as a same-run duplicate (it's a normal skip).
    expect(skippedDuplicates).toEqual([]);
  });

  test("a prior-applied file still makes a later byte-identical sibling a duplicate", () => {
    const ddl = `-- identical recurring DDL for x`;
    const first = mig("20260101", "000000", "2a407315", "add_x", ddl);
    const second = mig("20260102", "000000", "2a407315", "add_x", ddl);

    // first already in the ledger from a prior boot.
    const { toApply, skippedDuplicates } = planMigrations(
      [first, second],
      new Set(["2a407315"]),
    );

    expect(toApply).toEqual([]);
    expect(skippedDuplicates).toEqual([
      { file: second.file, original: first.file },
    ]);
  });

  test("normal distinct-hash migrations: all applied, none skipped", () => {
    const a = mig("20260101", "000000", "aaaaaaaa", "a", "SELECT 1");
    const b = mig("20260102", "000000", "bbbbbbbb", "b", "SELECT 2");
    const c = mig("20260103", "000000", "cccccccc", "c", "SELECT 3");

    const { toApply, skippedDuplicates } = planMigrations([a, b, c], new Set());

    expect(toApply).toEqual([a, b, c]);
    expect(skippedDuplicates).toEqual([]);
  });
});

// A phased schema migration's body, as the generator writes it.
function phased(
  expand: string,
  contract: string,
  claims: string[] = [],
): string {
  return renderPhasedMigration({ expand, contract, claims });
}

// The plan as `<file> <phase>` / `<file> record` lines: order is the subject.
function trace(migrations: Migration[], applied: string[] = []): string[] {
  return planSchemaSteps(migrations, new Set(applied)).steps.map((s) =>
    s.kind === "record" ? `${s.file} record` : `${s.file} ${s.phase}`,
  );
}

describe("planSchemaSteps", () => {
  test("legacy-only history keeps timestamp order, one step + ledger row each", () => {
    const a = mig("20260101", "000000", "aaaaaaaa", "a", "SELECT 1");
    const b = mig("20260102", "000000", "bbbbbbbb", "b", "SELECT 2");
    const c = mig("20260103", "000000", "cccccccc", "c", "SELECT 3");
    expect(trace([a, b, c])).toEqual([
      `${a.file} whole`,
      `${a.file} record`,
      `${b.file} whole`,
      `${b.file} record`,
      `${c.file} whole`,
      `${c.file} record`,
    ]);
  });

  test("a phased schema migration runs expand → claimed data (timestamp order) → contract", () => {
    const before = mig("20260101", "000000", "00000000", "before", "SELECT 0");
    const d1 = mig(
      "20260102",
      "000000",
      "d1d1d1d1",
      "backfill_one",
      "UPDATE x SET a = 1",
    );
    const other = mig(
      "20260103",
      "000000",
      "0a0a0a0a",
      "other_data",
      "UPDATE y SET b = 2",
    );
    const d2 = mig(
      "20260104",
      "000000",
      "d2d2d2d2",
      "backfill_two",
      "UPDATE x SET c = 3",
    );
    const s = mig(
      "20260105",
      "000000",
      "5a5a5a5a",
      "merged_20260105_0000",
      // Claims listed out of order: the group still runs them by timestamp.
      phased(
        'ALTER TABLE "x" ADD COLUMN "n" text;',
        'ALTER TABLE "x" DROP COLUMN "o";',
        ["20260104_000000__backfill_two", "20260102_000000__backfill_one"],
      ),
    );
    const plan = planSchemaSteps([before, d1, other, d2, s], new Set());
    expect(
      plan.steps.map((st) =>
        st.kind === "record" ? `${st.file} record` : `${st.file} ${st.phase}`,
      ),
    ).toEqual([
      `${before.file} whole`,
      `${before.file} record`,
      // Unclaimed data stays at its own position.
      `${other.file} whole`,
      `${other.file} record`,
      `${s.file} expand`,
      `${d1.file} whole`,
      `${d1.file} record`,
      `${d2.file} whole`,
      `${d2.file} record`,
      `${s.file} contract`,
      `${s.file} record`,
    ]);
    // The sections' own SQL, not the whole file.
    const sqlOf = (phase: string) =>
      plan.steps.find((st) => st.kind === "apply" && st.phase === phase);
    expect(sqlOf("expand")).toMatchObject({
      sql: 'ALTER TABLE "x" ADD COLUMN "n" text;',
    });
    expect(sqlOf("contract")).toMatchObject({
      sql: 'ALTER TABLE "x" DROP COLUMN "o";',
    });
    expect(plan.pendingFiles).toEqual([
      before.file,
      other.file,
      d1.file,
      d2.file,
      s.file,
    ]);
  });

  test("a data-only push (nothing claims it) runs at its own position", () => {
    const s = mig(
      "20260101",
      "000000",
      "5a5a5a5a",
      "merged_a",
      phased('ALTER TABLE "t" ADD COLUMN "id" text;', ""),
    );
    const d = mig(
      "20260102",
      "000000",
      "dddddddd",
      "data_only",
      "UPDATE t SET id = id",
    );
    expect(trace([s, d])).toEqual([
      `${s.file} expand`,
      `${s.file} record`,
      `${d.file} whole`,
      `${d.file} record`,
    ]);
  });

  test("empty sections emit no SQL step, but the ledger row still lands", () => {
    const s = mig(
      "20260101",
      "000000",
      "5a5a5a5a",
      "merged_empty",
      phased("", ""),
    );
    expect(trace([s])).toEqual([`${s.file} record`]);
    const d = mig(
      "20260101",
      "000000",
      "dddddddd",
      "data",
      "UPDATE t SET a = 1",
    );
    const c = mig(
      "20260102",
      "000000",
      "cccccccc",
      "merged_c",
      phased("", 'DROP TABLE "q";', ["20260101_000000__data"]),
    );
    expect(trace([d, c])).toEqual([
      `${d.file} whole`,
      `${d.file} record`,
      `${c.file} contract`,
      `${c.file} record`,
    ]);
  });

  test("applied files contribute no step; a partially applied group runs only what is pending", () => {
    const d = mig(
      "20260101",
      "000000",
      "dddddddd",
      "backfill",
      "UPDATE x SET a = 1",
    );
    const s = mig(
      "20260102",
      "000000",
      "5a5a5a5a",
      "merged_s",
      phased("SELECT 'e';", "SELECT 'c';", ["20260101_000000__backfill"]),
    );
    // Everything applied → nothing to do.
    expect(trace([d, s], ["dddddddd", "5a5a5a5a"])).toEqual([]);
    // The claimer applied, its data migration re-hashed since (new content):
    // the data runs alone, where its group stood.
    expect(trace([d, s], ["5a5a5a5a"])).toEqual([
      `${d.file} whole`,
      `${d.file} record`,
    ]);
    // The data applied, the claimer pending: expand and contract still run.
    expect(trace([d, s], ["dddddddd"])).toEqual([
      `${s.file} expand`,
      `${s.file} contract`,
      `${s.file} record`,
    ]);
  });

  test("duplicate hashes: the same-run sibling is skipped, as planMigrations decides", () => {
    const ddl = "-- identical recurring DDL";
    const first = mig("20260501", "182228", "2a407315", "add_q", ddl);
    const second = mig("20260503", "222323", "2a407315", "add_q", ddl);
    const plan = planSchemaSteps([first, second], new Set());
    expect(plan.steps.map((s) => s.file)).toEqual([first.file, first.file]);
    expect(plan.skippedDuplicates).toEqual([
      { file: second.file, original: first.file },
    ]);
  });

  test("a claim naming no file throws", () => {
    const s = mig(
      "20260102",
      "000000",
      "5a5a5a5a",
      "merged_s",
      phased("", "", ["20260101_000000__missing"]),
    );
    expect(() => planSchemaSteps([s], new Set())).toThrow(
      /no migration file has that timestamp and slug/,
    );
  });

  test("a file claimed twice throws", () => {
    const d = mig(
      "20260101",
      "000000",
      "dddddddd",
      "backfill",
      "UPDATE x SET a = 1",
    );
    const s1 = mig(
      "20260102",
      "000000",
      "11111111",
      "merged_one",
      phased("", "", ["20260101_000000__backfill"]),
    );
    const s2 = mig(
      "20260103",
      "000000",
      "22222222",
      "merged_two",
      phased("", "", ["20260101_000000__backfill"]),
    );
    expect(() => planSchemaSteps([d, s1, s2], new Set())).toThrow(
      /claimed by both/,
    );
  });

  test("a claim sorting after its claimer throws", () => {
    const s = mig(
      "20260101",
      "000000",
      "5a5a5a5a",
      "merged_s",
      phased("", "", ["20260102_000000__later"]),
    );
    const d = mig(
      "20260102",
      "000000",
      "dddddddd",
      "later",
      "UPDATE x SET a = 1",
    );
    expect(() => planSchemaSteps([s, d], new Set())).toThrow(/sorts after it/);
  });

  test("claiming a phased schema migration throws", () => {
    const a = mig(
      "20260101",
      "000000",
      "aaaaaaaa",
      "merged_a",
      phased("SELECT 1;", ""),
    );
    const b = mig(
      "20260102",
      "000000",
      "bbbbbbbb",
      "merged_b",
      phased("", "", ["20260101_000000__merged_a"]),
    );
    expect(() => planSchemaSteps([a, b], new Set())).toThrow(
      /only data migrations can be claimed/,
    );
  });

  test("validation covers applied files too", () => {
    const d = mig(
      "20260101",
      "000000",
      "dddddddd",
      "backfill",
      "UPDATE x SET a = 1",
    );
    const s1 = mig(
      "20260102",
      "000000",
      "11111111",
      "merged_one",
      phased("", "", ["20260101_000000__backfill"]),
    );
    const s2 = mig(
      "20260103",
      "000000",
      "22222222",
      "merged_two",
      phased("", "", ["20260101_000000__backfill"]),
    );
    expect(() =>
      planSchemaSteps(
        [d, s1, s2],
        new Set(["dddddddd", "11111111", "22222222"]),
      ),
    ).toThrow(/claimed by both/);
  });
});

// research/2026-09-30-global-clone-migrations-published-set.md: after an
// upstream update the history interleaves two independently phased sides by
// timestamp, joined by a merge node (an empty phased group behind its header).
describe("planSchemaSteps over a merged history", () => {
  // User side: data dU claimed by schema sU. Upstream side: data dP claimed by
  // schema sP. Interleaved: dU, dP, sU, sP, then the merge node.
  const dU = mig(
    "20260901",
    "000000",
    "0d0d0d0d",
    "user_backfill",
    "UPDATE u SET a = 1",
  );
  const dP = mig(
    "20260902",
    "000000",
    "1d1d1d1d",
    "upstream_backfill",
    "UPDATE p SET a = 1",
  );
  const sU = mig(
    "20260903",
    "000000",
    "05050505",
    "user_schema",
    phased(
      'ALTER TABLE "u" ADD COLUMN "n" text;',
      'ALTER TABLE "u" DROP COLUMN "o";',
      ["20260901_000000__user_backfill"],
    ),
  );
  const sP = mig(
    "20260904",
    "000000",
    "15151515",
    "upstream_schema",
    phased(
      'ALTER TABLE "p" ADD COLUMN "n" text;',
      'ALTER TABLE "p" DROP COLUMN "o";',
      ["20260902_000000__upstream_backfill"],
    ),
  );
  const merge = mig(
    "20260904",
    "000001",
    "33333333",
    "merge_snapshot",
    renderMergeSnapshotMigration([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ]),
  );
  const history = [dU, dP, sU, sP, merge];

  test("a fresh install runs each side's group in timestamp order; the merge node only records", () => {
    expect(trace(history)).toEqual([
      `${sU.file} expand`,
      `${dU.file} whole`,
      `${dU.file} record`,
      `${sU.file} contract`,
      `${sU.file} record`,
      `${sP.file} expand`,
      `${dP.file} whole`,
      `${dP.file} record`,
      `${sP.file} contract`,
      `${sP.file} record`,
      `${merge.file} record`,
    ]);
  });

  test("the user's DB (own side applied) runs only upstream's group and the merge node", () => {
    expect(trace(history, [dU.hash, sU.hash])).toEqual([
      `${sP.file} expand`,
      `${dP.file} whole`,
      `${dP.file} record`,
      `${sP.file} contract`,
      `${sP.file} record`,
      `${merge.file} record`,
    ]);
  });
});
