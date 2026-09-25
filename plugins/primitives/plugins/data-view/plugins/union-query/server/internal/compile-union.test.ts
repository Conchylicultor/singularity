import { describe, expect, it } from "bun:test";
import { sql, type SQL } from "drizzle-orm";
import {
  integer,
  jsonb,
  PgDialect,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import {
  and,
  clause,
  or,
  type Filter,
} from "@plugins/network/plugins/live/plugins/filter/core";
import { encodeCursor } from "@plugins/primitives/plugins/keyset/core";
import { unionFilterable, UnionCursorMismatchError } from "../../core";
import type { UnionColumnSpecs } from "../../core";
import { compileUnionPage, type UnionArm } from "./compile-union";

// Two throwaway ledgers with deliberately different shapes: `builds` has a
// namespace and a tag array (jsonb), `backups` has neither and carries a byte size
// instead. That asymmetry IS the thing under test.
const builds = pgTable("build_runs", {
  id: text("id").primaryKey(),
  targets: jsonb("targets").notNull(),
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
  id: { domain: "text", sqlType: "text" },
  label: { domain: "text", sqlType: "text" },
  outcome: { domain: "text", sqlType: "text" },
  startedAt: { domain: "instant", sqlType: "timestamptz" },
  finishedAt: { domain: "instant", sqlType: "timestamptz", nullable: true },
  namespace: { domain: "text", sqlType: "text", nullable: true },
};

const EXTRA: UnionColumnSpecs = {
  "build.targets": { domain: "stringArray", sqlType: "jsonb", nullable: true },
  "backup.archiveSize": {
    domain: "number",
    sqlType: "integer",
    nullable: true,
  },
};

const buildArm: UnionArm = {
  kind: "build",
  table: builds,
  base: {
    id: builds.id,
    label: sql`${builds.targets}::text`,
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

const dialect = new PgDialect();
const render = (s: SQL): string => dialect.sqlToQuery(s).sql;

const targets = (op: "hasAll" | "hasNone", tag: string): Filter =>
  clause("build.targets", op, [tag]) as Filter;

function compile(over: Partial<Parameters<typeof compileUnionPage>[0]> = {}) {
  return compileUnionPage({
    arms: [buildArm, backupArm],
    base: BASE,
    extra: EXTRA,
    tiebreaker: { fieldId: "id" },
    sort: [{ fieldId: "startedAt", direction: "desc" }],
    filter: undefined,
    cursor: null,
    limit: 26,
    ...over,
  });
}

describe("arm pruning", () => {
  it("a conjunctive positive clause on an arm column removes every arm that lacks it", () => {
    const compiled = compile({ filter: targets("hasAll", "sonata") });
    expect(compiled.prunedArms).toEqual(["backup"]);
    const out = render(compiled.sql);
    expect(out).toContain('"build_runs"');
    expect(out).not.toContain('"backup_runs"');
  });

  it("a NEGATIVE clause keeps the arm lacking the column — NULL satisfies it", () => {
    // Complement semantics: `targets hasNone [sonata]` is TRUE for a row whose
    // targets are NULL, which is every backup row. Pruning backup would drop
    // rows the filter admits.
    for (const f of [
      targets("hasNone", "sonata"),
      clause("build.targets", "isEmpty") as Filter,
    ]) {
      const compiled = compile({ filter: f });
      expect(compiled.prunedArms).toEqual([]);
      expect(render(compiled.sql)).toContain('"backup_runs"');
    }
    // …and its positive twin does prune.
    expect(
      compile({ filter: clause("build.targets", "isNotEmpty") as Filter })
        .prunedArms,
    ).toEqual(["backup"]);
  });

  it("does NOT prune on a clause inside an OR — the row could match the other branch", () => {
    const compiled = compile({
      filter: or(
        targets("hasAll", "sonata"),
        clause("outcome", "eq", "failed"),
      ),
    });
    expect(compiled.prunedArms).toEqual([]);
    expect(render(compiled.sql)).toContain('"backup_runs"');
  });

  it("a base column an arm nulls is answered by the op: eq prunes, isEmpty keeps", () => {
    // `namespace` is a base column `backup` binds to null.
    expect(
      compile({ filter: clause("namespace", "eq", "main") }).prunedArms,
    ).toEqual(["backup"]);
    expect(
      compile({ filter: clause("namespace", "isEmpty") }).prunedArms,
    ).toEqual([]);
  });

  it("a clause on the discriminator prunes the kinds it excludes", () => {
    expect(
      compile({ filter: clause("kind", "in", ["build"]) }).prunedArms,
    ).toEqual(["backup"]);
    expect(
      compile({ filter: clause("kind", "ne", "build") }).prunedArms,
    ).toEqual(["build"]);
  });

  it("a conjunct deeper in an AND prunes too", () => {
    const compiled = compile({
      filter: and(
        clause("outcome", "eq", "failed"),
        targets("hasAll", "sonata"),
      ),
    });
    expect(compiled.prunedArms).toEqual(["backup"]);
  });

  it("pruning every arm yields a valid, provably empty scaffold", () => {
    const compiled = compileUnionPage({
      arms: [backupArm],
      base: BASE,
      extra: EXTRA,
      tiebreaker: { fieldId: "id" },
      sort: [{ fieldId: "startedAt", direction: "desc" }],
      filter: targets("hasAll", "sonata"),
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

describe("unionFilterable", () => {
  it("declares every base and arm column plus the discriminator, by domain", () => {
    expect(unionFilterable(BASE, EXTRA)).toEqual({
      kind: { domain: "text" },
      id: { domain: "text" },
      label: { domain: "text" },
      outcome: { domain: "text" },
      startedAt: { domain: "instant" },
      finishedAt: { domain: "instant" },
      namespace: { domain: "text" },
      "build.targets": { domain: "stringArray" },
      "backup.archiveSize": { domain: "number" },
    });
  });

  it("leaves a read-only (null-domain) column undeclared, and never binds it", () => {
    const extra: UnionColumnSpecs = {
      ...EXTRA,
      "backup.blob": { domain: null, sqlType: "jsonb", nullable: true },
    };
    expect(unionFilterable(BASE, extra)).not.toHaveProperty("backup.blob");
    const out = render(compile({ extra }).sql);
    // Still projected (the row reads it) …
    expect(out).toContain('NULL::jsonb AS "backup.blob"');
    // … but a filter naming it cannot compile.
    expect(() =>
      compile({
        extra,
        filter: clause("backup.blob", "isEmpty") as Filter,
      }),
    ).toThrow(/"backup\.blob"/);
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
    expect(buildSql).not.toContain("NULL::jsonb");
    expect(backupSql).toContain('NULL::text AS "namespace"');
    expect(backupSql).toContain('NULL::jsonb AS "build.targets"');
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
        base: { ...BASE, 'ev"il': { domain: "text", sqlType: "text" } },
      }),
    ).toThrow(/bare identifier/);
  });

  it("refuses a sqlType that is not a Postgres type name", () => {
    expect(() =>
      compile({
        base: {
          ...BASE,
          weird: { domain: "text", sqlType: "text; drop table x" },
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
      // The host lowers the search box into the filter: an OR of contains.
      filter: and(
        clause("outcome", "eq", "failed"),
        or(
          clause("label", "contains", "nightly"),
          clause("namespace", "contains", "nightly"),
        ),
      ),
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
    // Search over `namespace` only: backup has none, so `contains` over its
    // NULL is false — the arm leaves the union instead of ignoring the box.
    const compiled = compile({
      filter: clause("namespace", "contains", "prod"),
    });
    expect(compiled.prunedArms).toEqual(["backup"]);
    expect(render(compiled.sql)).not.toContain('"backup_runs"');
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
