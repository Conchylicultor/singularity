import { describe, expect, it } from "bun:test";
import { sql, type SQL } from "drizzle-orm";
import {
  integer,
  PgDialect,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { FilterGroup } from "@plugins/primitives/plugins/data-view/core";
import type { OperatorSqlResolver } from "@plugins/primitives/plugins/data-view/plugins/server-query/server";
import { encodeCursor } from "@plugins/primitives/plugins/keyset/core";
import { UnionCursorMismatchError } from "../../core";
import type { UnionColumnSpecs } from "../../core";
import { compileUnionPage, type UnionArm } from "./compile-union";

// Two throwaway ledgers with deliberately different shapes: `builds` has a
// namespace and a tag array, `backups` has neither and carries a byte size
// instead. That asymmetry IS the thing under test.
const builds = pgTable("build_runs", {
  id: text("id").primaryKey(),
  targets: text("targets").array().notNull(),
  status: text("status").notNull(),
  namespace: text("namespace").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

const backups = pgTable("backup_runs", {
  id: text("id").primaryKey(),
  outcome: text("outcome").notNull(),
  archiveSize: integer("archive_size"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

const BASE: UnionColumnSpecs = {
  id: { type: "text", sqlType: "text" },
  label: { type: "text", sqlType: "text" },
  outcome: { type: "enum", sqlType: "text" },
  startedAt: { type: "date", sqlType: "timestamptz" },
  finishedAt: { type: "date", sqlType: "timestamptz", nullable: true },
  namespace: { type: "text", sqlType: "text", nullable: true },
};

const EXTRA: UnionColumnSpecs = {
  "build.targets": { type: "tags", sqlType: "text[]", nullable: true },
  "backup.archiveSize": { type: "number", sqlType: "integer", nullable: true },
};

const buildArm: UnionArm = {
  kind: "build",
  table: builds,
  base: {
    id: builds.id,
    label: sql`array_to_string(${builds.targets}, ', ')`,
    outcome: builds.status,
    startedAt: builds.startedAt,
    finishedAt: builds.finishedAt,
    namespace: builds.namespace,
  },
  extra: { "build.targets": builds.targets },
};

const backupArm: UnionArm = {
  kind: "backup",
  table: backups,
  base: {
    id: backups.id,
    label: sql`'Backup'`,
    outcome: backups.outcome,
    startedAt: backups.startedAt,
    finishedAt: backups.finishedAt,
    // A backup is host-global: it genuinely has no namespace.
    namespace: null,
  },
  extra: { "backup.archiveSize": backups.archiveSize },
};

// A tiny resolver covering only the operators these tests exercise.
const resolve: OperatorSqlResolver = (typeId, operatorId) => {
  if (typeId === "tags" && operatorId === "contains") {
    return (col, operand) =>
      typeof operand === "string"
        ? sql`${col} @> ARRAY[${operand}]`
        : undefined;
  }
  if (operatorId === "is") {
    return (col, operand) =>
      operand == null ? undefined : sql`${col} = ${operand}`;
  }
  return null;
};

const dialect = new PgDialect();
const render = (s: SQL): string => dialect.sqlToQuery(s).sql;

const rule = (fieldId: string, operatorId: string, value: unknown) =>
  ({ kind: "rule", id: `r-${fieldId}`, fieldId, operatorId, value }) as const;

const group = (
  conjunction: "and" | "or",
  ...children: FilterGroup["children"]
): FilterGroup => ({ kind: "group", id: "g", conjunction, children });

function compile(over: Partial<Parameters<typeof compileUnionPage>[0]> = {}) {
  return compileUnionPage({
    arms: [buildArm, backupArm],
    base: BASE,
    extra: EXTRA,
    tiebreaker: { fieldId: "id" },
    resolveOperator: resolve,
    sort: [{ fieldId: "startedAt", direction: "desc" }],
    filter: null,
    query: "",
    searchFields: ["label", "namespace"],
    cursor: null,
    limit: 26,
    ...over,
  });
}

describe("arm pruning", () => {
  it("a conjunctive rule on an arm column removes every arm that lacks it", () => {
    const compiled = compile({
      filter: group("and", rule("build.targets", "contains", "sonata")),
    });
    expect(compiled.prunedArms).toEqual(["backup"]);
    const out = render(compiled.sql);
    expect(out).toContain('"build_runs"');
    expect(out).not.toContain('"backup_runs"');
  });

  it("does NOT prune on a rule inside an OR — the row could match the other branch", () => {
    const compiled = compile({
      filter: group(
        "or",
        rule("build.targets", "contains", "sonata"),
        rule("outcome", "is", "failed"),
      ),
    });
    expect(compiled.prunedArms).toEqual([]);
    expect(render(compiled.sql)).toContain('"backup_runs"');
  });

  it("leaves a base column an arm nulls alone — NULL is an answer, not an absence", () => {
    // `namespace` is a base column `backup` binds to null. A rule on it must
    // NOT prune: `namespace is empty` legitimately matches those rows.
    const compiled = compile({
      filter: group("and", rule("namespace", "is", "main")),
    });
    expect(compiled.prunedArms).toEqual([]);
    expect(render(compiled.sql)).toContain('"backup_runs"');
  });

  it("pruning every arm yields a valid, provably empty scaffold", () => {
    const compiled = compileUnionPage({
      arms: [backupArm],
      base: BASE,
      extra: EXTRA,
      tiebreaker: { fieldId: "id" },
      resolveOperator: resolve,
      sort: [{ fieldId: "startedAt", direction: "desc" }],
      filter: group("and", rule("build.targets", "contains", "sonata")),
      query: "",
      cursor: null,
      limit: 26,
    });
    expect(compiled.prunedArms).toEqual(["backup"]);
    const out = render(compiled.sql);
    expect(out).toContain("WHERE false");
    expect(out).toContain('NULL::text AS "label"');
    expect(out).not.toContain('"backup_runs"');
  });
});

describe("null projection alignment", () => {
  it("every arm projects the same ordered alias list", () => {
    const { arms } = splitArms(render(compile().sql));
    const aliasesPerArm = arms.map((armSql) =>
      [...armSql.matchAll(/ AS "([^"]+)"/g)].map((m) => m[1]),
    );
    expect(aliasesPerArm).toHaveLength(2);
    expect(aliasesPerArm[0]).toEqual([
      "kind",
      "id",
      "label",
      "outcome",
      "startedAt",
      "finishedAt",
      "namespace",
      "build.targets",
      "backup.archiveSize",
    ]);
    expect(aliasesPerArm[1]).toEqual(aliasesPerArm[0]);
  });

  it("casts every unowned column's NULL to the declared Postgres type", () => {
    const { arms } = splitArms(render(compile().sql));
    const [buildSql, backupSql] = arms;
    // `build` owns no archive size; `backup` owns neither namespace nor targets.
    expect(buildSql).toContain('NULL::integer AS "backup.archiveSize"');
    expect(buildSql).not.toContain("NULL::text[]");
    expect(backupSql).toContain('NULL::text AS "namespace"');
    expect(backupSql).toContain('NULL::text[] AS "build.targets"');
  });

  it("stamps the discriminator as a typed literal on each arm", () => {
    const { sql: statement } = compile();
    const out = render(statement);
    expect(out).toContain('::text AS "kind"');
    expect(dialect.sqlToQuery(statement).params).toContain("build");
    expect(dialect.sqlToQuery(statement).params).toContain("backup");
  });

  it("refuses a column id that is not a bare identifier", () => {
    expect(() =>
      compile({
        base: { ...BASE, 'ev"il': { type: "text", sqlType: "text" } },
      }),
    ).toThrow(/bare identifier/);
  });

  it("refuses a sqlType that is not a Postgres type name", () => {
    expect(() =>
      compile({
        base: {
          ...BASE,
          weird: { type: "text", sqlType: "text; drop table x" },
        },
      }),
    ).toThrow(/Postgres type name/);
  });
});

describe("push-down", () => {
  it("puts the filter, the seek and the limit INSIDE each arm, and re-orders outside", () => {
    const cursor = encodeCursor(
      [new Date("2026-08-01T00:00:00Z"), "abc"],
      "startedAt:desc",
    );
    const compiled = compile({
      cursor,
      filter: group("and", rule("outcome", "is", "failed")),
      query: "nightly",
    });
    const { outer, arms } = splitArms(render(compiled.sql));

    expect(arms).toHaveLength(2);
    for (const armSql of arms) {
      // the compiled filter
      expect(armSql).toContain("= $");
      // the free-text search
      expect(armSql).toContain("ILIKE");
      // the keyset seek
      expect(armSql).toContain("<");
      // and its own limit
      expect(armSql).toContain("LIMIT $");
      expect(armSql).toContain("ORDER BY");
    }
    // The outer query re-orders and re-limits the merged prefixes.
    expect(outer).toContain('ORDER BY "u"."startedAt" DESC NULLS LAST');
    expect(outer).toContain("LIMIT $");
  });

  it("an arm owning none of the search columns matches nothing rather than ignoring the box", () => {
    const compiled = compile({ query: "prod", searchFields: ["namespace"] });
    const { arms } = splitArms(render(compiled.sql));
    expect(arms[1]).toContain("false");
    expect(arms[1]).not.toContain("ILIKE");
  });

  it("orders every key NULLS LAST, so a sort on an arm column puts other kinds last", () => {
    const compiled = compile({
      sort: [{ fieldId: "backup.archiveSize", direction: "desc" }],
    });
    const out = render(compiled.sql);
    expect(out).toContain('ORDER BY "u"."backup.archiveSize" DESC NULLS LAST');
    // The total-order tail is always appended: row identity, then the kind.
    expect(compiled.keys.map((k) => k.fieldId)).toEqual([
      "backup.archiveSize",
      "id",
      "kind",
    ]);
  });

  it("appends the kind key so the seek has a total order across arms", () => {
    expect(compile().keys.map((k) => k.fieldId)).toEqual([
      "startedAt",
      "id",
      "kind",
    ]);
  });
});

describe("cursor signature", () => {
  it("refuses a cursor minted under a different sort", () => {
    const stale = encodeCursor([1], "label:asc");
    expect(() => compile({ cursor: stale })).toThrow(UnionCursorMismatchError);
  });

  it("accepts one minted under the same sort, and reports the signature to stamp", () => {
    const fresh = encodeCursor([new Date(), "abc"], "startedAt:desc");
    const compiled = compile({ cursor: fresh });
    expect(compiled.sortSignature).toBe("startedAt:desc");
  });
});

/** The outer wrapper text, and one chunk per arm subselect. */
function splitArms(rendered: string): { outer: string; arms: string[] } {
  const open = rendered.indexOf("((");
  const close = rendered.lastIndexOf("))");
  const inner = rendered.slice(open + 1, close + 1);
  const outer = rendered.slice(0, open) + rendered.slice(close + 1);
  return { outer, arms: inner.split("UNION ALL") };
}
