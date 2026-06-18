import { test, expect } from "bun:test";
import { z } from "zod";
import {
  doublePrecision,
  integer,
  jsonb,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { getTableConfig } from "drizzle-orm/pg-core";
import { collectContributions } from "@plugins/framework/plugins/server-core/core";
import { defineFieldType } from "@plugins/fields/core";
import type { FieldDef } from "@plugins/fields/core";
import { Fields } from "@plugins/fields/server";
import { defineEntity } from "./define-entity";
import { defaultNow, defaultRandom } from "./types";

// ── Throwaway field types + storage builders ───────────────────────────────
// Local field types via fields/core keep this unit decoupled from concrete
// field-type plugins (importing a sibling type would form a cross-plugin
// cycle). Storage builders are registered exactly as fields-to-columns.test.ts.
const textType = defineFieldType<string>("__ent_text__");
const uuidType = defineFieldType<string>("__ent_uuid__");
const intType = defineFieldType<number>("__ent_int__");
const floatType = defineFieldType<number>("__ent_float__");
const dateType = defineFieldType<Date>("__ent_date__");
// A type with NO storage contribution — exercises the throw path.
const noStorageType = defineFieldType<string>("__ent_no_storage__");

// json field type is generic over its payload T; build it per-payload below.
function jsonType<T>() {
  return defineFieldType<T>("__ent_json__");
}

collectContributions([
  {
    id: "define-entity-test",
    contributions: [
      Fields.Storage({ type: textType, build: (n) => text(n) }),
      Fields.Storage({ type: uuidType, build: (n) => uuid(n) }),
      Fields.Storage({ type: intType, build: (n) => integer(n) }),
      Fields.Storage({ type: floatType, build: (n) => doublePrecision(n) }),
      Fields.Storage({
        type: jsonType<unknown>(),
        build: (n) => jsonb(n),
      }),
      Fields.Storage({
        type: dateType,
        build: (n) => timestamp(n, { withTimezone: true }),
      }),
    ],
  },
]);

// ── Field-def helpers ──────────────────────────────────────────────────────
function field<T>(
  type: ReturnType<typeof defineFieldType<T>>,
  schema: z.ZodType<T>,
  defaultValue: T,
): FieldDef<T> {
  return Object.freeze({ type, schema, defaultValue, meta: {} });
}

// Payload shapes for the json columns (mirror slow_ops core types).
interface CallerBreakdown {
  caller: string;
  count: number;
}
interface SlowOpSample {
  at: number;
  load: number;
}

// ── The slow_ops shape, rebuilt through defineEntity ───────────────────────
function buildSlowOps() {
  return defineEntity(
    "slow_ops",
    {
      id: field(uuidType, z.string(), ""),
      worktree: field(textType, z.string(), ""),
      operationKind: field(textType, z.string(), ""),
      operation: field(textType, z.string(), ""),
      count: field(intType, z.number(), 0),
      totalMs: field(floatType, z.number(), 0),
      maxMs: field(floatType, z.number(), 0),
      lastMs: field(floatType, z.number(), 0),
      thresholdMs: field(floatType, z.number(), 0),
      callers: field(
        jsonType<CallerBreakdown[]>(),
        z.array(
          z.object({ caller: z.string(), count: z.number() }),
        ) as z.ZodType<CallerBreakdown[]>,
        [],
      ),
      recentSamples: field(
        jsonType<SlowOpSample[]>(),
        z.array(
          z.object({ at: z.number(), load: z.number() }),
        ) as z.ZodType<SlowOpSample[]>,
        [],
      ),
      firstSeenAt: field(dateType, z.date(), new Date(0)),
      lastSeenAt: field(dateType, z.date(), new Date(0)),
    },
    {
      primaryKey: "id",
      columns: {
        id: { default: defaultRandom() },
        count: { default: 0 },
        totalMs: { default: 0 },
        maxMs: { default: 0 },
        lastMs: { default: 0 },
        thresholdMs: { default: 0 },
        callers: { default: [] },
        recentSamples: { default: [] },
        firstSeenAt: { default: defaultNow() },
        lastSeenAt: { default: defaultNow() },
      },
    },
  );
}

test("defineEntity reproduces the slow_ops column names (snake_case)", () => {
  const slowOps = buildSlowOps();
  const { columns } = getTableConfig(slowOps.table);
  const byName = new Map(columns.map((c) => [c.name, c]));

  // snake_case DDL column names, keyed by JS prop in the entity record.
  expect(slowOps.table.operationKind.name).toBe("operation_kind");
  expect(slowOps.table.totalMs.name).toBe("total_ms");
  expect(slowOps.table.firstSeenAt.name).toBe("first_seen_at");
  expect(slowOps.table.recentSamples.name).toBe("recent_samples");
  expect(slowOps.table.worktree.name).toBe("worktree");

  expect(byName.has("operation_kind")).toBe(true);
  expect(byName.has("total_ms")).toBe(true);
  expect(byName.has("first_seen_at")).toBe(true);
});

test("defineEntity reproduces per-column notNull / primary / hasDefault / SQL type", () => {
  const slowOps = buildSlowOps();
  const { columns } = getTableConfig(slowOps.table);
  const col = (name: string) => {
    const c = columns.find((c) => c.name === name);
    if (!c) throw new Error(`no column ${name}`);
    return c;
  };

  // id: uuid, PK, defaultRandom (hasDefault), notNull
  const id = col("id");
  expect(id.getSQLType()).toBe("uuid");
  expect(id.primary).toBe(true);
  expect(id.notNull).toBe(true);
  expect(id.hasDefault).toBe(true);

  // worktree: text, notNull, NO default
  const worktree = col("worktree");
  expect(worktree.getSQLType()).toBe("text");
  expect(worktree.notNull).toBe(true);
  expect(worktree.hasDefault).toBe(false);
  expect(worktree.primary).toBe(false);

  // count: integer, notNull, default 0
  const count = col("count");
  expect(count.getSQLType()).toBe("integer");
  expect(count.notNull).toBe(true);
  expect(count.hasDefault).toBe(true);

  // totalMs: double precision, notNull, default 0
  const totalMs = col("total_ms");
  expect(totalMs.getSQLType()).toBe("double precision");
  expect(totalMs.notNull).toBe(true);
  expect(totalMs.hasDefault).toBe(true);

  // callers: jsonb, notNull, default []
  const callers = col("callers");
  expect(callers.getSQLType()).toBe("jsonb");
  expect(callers.notNull).toBe(true);
  expect(callers.hasDefault).toBe(true);

  // firstSeenAt: timestamp with time zone, notNull, defaultNow (hasDefault)
  const firstSeenAt = col("first_seen_at");
  expect(firstSeenAt.getSQLType()).toBe("timestamp with time zone");
  expect(firstSeenAt.notNull).toBe(true);
  expect(firstSeenAt.hasDefault).toBe(true);
});

test("defineEntity passes through indexes via the third-arg callback", () => {
  const { uniqueIndex } = require("drizzle-orm/pg-core");
  const slowOps = defineEntity(
    "slow_ops_idx",
    {
      id: field(uuidType, z.string(), ""),
      worktree: field(textType, z.string(), ""),
      operationKind: field(textType, z.string(), ""),
      operation: field(textType, z.string(), ""),
    },
    {
      primaryKey: "id",
      columns: { id: { default: defaultRandom() } },
      indexes: (t) => [
        uniqueIndex("slow_ops_kind_op_worktree_idx").on(
          t.operationKind,
          t.operation,
          t.worktree,
        ),
      ],
    },
  );

  const { indexes } = getTableConfig(slowOps.table);
  expect(indexes.length).toBe(1);
  const idx = indexes[0]!;
  expect(idx.config.name).toBe("slow_ops_kind_op_worktree_idx");
  expect(idx.config.unique).toBe(true);
  expect(idx.config.columns.map((c: any) => c.name)).toEqual([
    "operation_kind",
    "operation",
    "worktree",
  ]);
});

test("entity.schema validates a sample row", () => {
  const slowOps = buildSlowOps();
  const row = {
    id: "11111111-1111-1111-1111-111111111111",
    worktree: "main",
    operationKind: "http",
    operation: "GET /x",
    count: 3,
    totalMs: 12.5,
    maxMs: 9,
    lastMs: 4.2,
    thresholdMs: 2,
    callers: [{ caller: "loader", count: 3 }],
    recentSamples: [{ at: 1, load: 0.5 }],
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
  };
  expect(() => slowOps.schema.parse(row)).not.toThrow();
});

test("defineEntity throws (naming key + type) for a field whose type has no storage", () => {
  expect(() =>
    defineEntity("bad", {
      id: field(uuidType, z.string(), ""),
      kind: field(noStorageType, z.string(), ""),
    }),
  ).toThrow(/"kind"/);
  expect(() =>
    defineEntity("bad", {
      id: field(uuidType, z.string(), ""),
      kind: field(noStorageType, z.string(), ""),
    }),
  ).toThrow(/__ent_no_storage__/);
});

// ── Compile-time guard: z.infer<schema> ≡ table.$inferSelect ────────────────
// The whole point of Stage C: the two derive from one FieldsRecord and must be
// identical by construction. A drift is a tsc error on this line.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B
  ? 1
  : 2
  ? true
  : false;
type Expect<T extends true> = T;

const slowOpsForType = buildSlowOps();
type _SchemaInfer = z.infer<typeof slowOpsForType.schema>;
type _SelectInfer = (typeof slowOpsForType.table)["$inferSelect"];
// Exported so noUnusedLocals keeps the assertion (a type-test alias).
export type _RowMatchesWire = Expect<Equal<_SchemaInfer, _SelectInfer>>;

// ── Compile-time guard: DB-defaulted columns are OPTIONAL on insert ─────────
// A column with a DB default (`meta.columns[k].default`, incl. defaultNow /
// defaultRandom / the `[]` rings) must NOT be required by `$inferInsert` — a
// loader inserting a row may omit it and let the DB fill it. This is exactly
// what `record-slow-op.ts` relies on (its insert omits id / recentSamples /
// firstSeenAt / lastSeenAt). Without the `HasDefault` brand on `EntityColumns`,
// the select-exact cast made every column required on insert — the Stage D
// regression this guards. `worktree` / `operationKind` / `operation` carry NO
// DB default, so they stay required.
type _Insert = (typeof slowOpsForType.table)["$inferInsert"];
type OptionalKeys<T> = {
  [K in keyof T]-?: object extends Pick<T, K> ? K : never;
}[keyof T];
type RequiredKeys<T> = Exclude<keyof T, OptionalKeys<T>>;
// The defaulted columns must be optional…
export type _DefaultedColsAreOptional = Expect<
  Equal<
    Extract<
      | "id"
      | "count"
      | "totalMs"
      | "maxMs"
      | "lastMs"
      | "thresholdMs"
      | "callers"
      | "recentSamples"
      | "firstSeenAt"
      | "lastSeenAt",
      OptionalKeys<_Insert>
    >,
    | "id"
    | "count"
    | "totalMs"
    | "maxMs"
    | "lastMs"
    | "thresholdMs"
    | "callers"
    | "recentSamples"
    | "firstSeenAt"
    | "lastSeenAt"
  >
>;
// …and the no-DB-default columns must stay required.
export type _NoDefaultColsAreRequired = Expect<
  Equal<
    Extract<"worktree" | "operationKind" | "operation", RequiredKeys<_Insert>>,
    "worktree" | "operationKind" | "operation"
  >
>;

// Runtime mirror of the `record-slow-op.ts` insert shape: omitting every
// DB-defaulted column must satisfy the insert type. Compiles (and runs as a
// trivial assertion) iff the optionality above holds.
test("DB-defaulted columns may be omitted from an insert", () => {
  const insertValues: _Insert = {
    worktree: "main",
    operationKind: "http",
    operation: "GET /x",
  };
  expect(insertValues.worktree).toBe("main");
});
