# entities

`defineEntity(name, fields, meta)` derives BOTH a Drizzle `pgTable` AND a zod
wire schema from one `FieldsRecord`, so `entity.table.$inferSelect` is
**identical by construction** to `z.infer<entity.schema>`. A loader becomes
`db.select().from(entity.table)` with no row projection, and field-set drift
(a column whose nullability/type disagrees with its field's schema) becomes a
`tsc` error instead of a silently dropped field.

This is Stage C of the fields-unified-entities roadmap
(`research/2026-06-18-global-define-entity-stage-c.md`), built on the Stage A
`fields.storage` capability and the Stage B `FieldDef` atom + `fieldsToZodObject`.
Server-only runtime — keeps `drizzle-orm/pg-core` off the browser bundle, like
`fields/server`.

## API

```ts
import { defineEntity, defaultNow, defaultRandom } from "@plugins/infra/plugins/entities/server";

export const slowOps = defineEntity(
  "slow_ops",
  {
    id:            uuidField(),
    worktree:      textField(),
    operationKind: textField(),
    count:         intField(),
    callers:       jsonField<CallerBreakdown[]>(),
    firstSeenAt:   dateField(),
  },
  {
    primaryKey: "id",                 // string → .primaryKey(); array → composite primaryKey({columns})
    columns: {
      id:          { default: defaultRandom() },
      count:       { default: 0 },    // bare value = .default(value) sugar
      firstSeenAt: { default: defaultNow() },
    },
    indexes: (t) => [
      uniqueIndex("slow_ops_kind_op_worktree_idx").on(t.operationKind, t.operation, t.worktree),
    ],
  },
);

// drizzle-kit discovery — same convention as entity-extensions / attachments:
export const _slowOpsTable = slowOps.table;

type SlowOpRow = EntityRow<typeof slowOps>;   // = z.infer<typeof slowOps.schema>
```

## How it derives the two artifacts from one field record

- **Columns** — `resolveFieldStorage(field.type.id)` gives the BARE column
  builder; the factory applies modifiers (`$type<T>()`, `.notNull()`,
  `.primaryKey()`, `.default()`). It does NOT use `fieldsToColumns` (that
  hardcodes camelCase column names + no modifiers). The DB column name is
  `meta.columns.<key>.name ?? snakeCase(key)` — a JS-prop-keyed `$inferSelect`
  is unaffected by snake_case (purely a DDL concern).
- **Schema** — `fieldsToZodObject(fields)`, keyed by the same JS props.

The precise select-type alignment is the one load-bearing cast:
`builders as unknown as EntityColumns<F>` fed to `pgTable`, which lets drizzle's
own `BuildColumns` infer the right select type. `EntityColumns` brands each
column with `$Type<…, InferFieldValue<F[K]>>` + `NotNull` — `$type` carries
nullability (`InferFieldValue` already encodes `T | null`), and `.default()` /
`.primaryKey()` are deliberately omitted from the cast (they affect only the
INSERT model, not select), keeping the select type exact.

## Nullability & defaults — two distinct concepts

- **Nullability** is derived from the RAW `field.schema`: a `ZodOptional` /
  `ZodNullable` leaves the column nullable; anything else gets `.notNull()`.
  Deriving it from the schema is what prevents wire/column nullability drift.
- **DB defaults are OPT-IN per column** via `meta.columns.<key>.default` — they
  are a DISTINCT concept from a field's wire/backfill default
  (`field.defaultValue`). `defineEntity` never auto-applies `field.defaultValue`
  (e.g. `worktree` has a `""` wire default but no DB default). Markers:
  `defaultNow()` (timestamp), `defaultRandom()` (uuid), `sqlDefault(sql\`…\`)`,
  or a bare value = `.default(value)` sugar.

> `defaultNow()` / `defaultRandom()` are valid only for date/uuid fields (the
> builder must actually expose the method). Mis-targeting throws a clear error
> naming the column.

## Foreign keys & cascade deletes

FKs are **opt-in per column** via `meta.columns.<key>.references`, carrying a
**lazy column thunk** plus optional `onDelete` / `onUpdate` — the exact shape of
drizzle's native `.references(() => other.id, { onDelete })`, so a relational
cluster reads the same as hand-written drizzle while keeping the
`$inferSelect ≡ z.infer<schema>` guarantee:

```ts
export const mailThreads = defineEntity("mail_threads", { … }, {
  primaryKey: "id",
  columns: {
    accountId: { references: { column: () => mailAccounts.table.id, onDelete: "cascade" } },
  },
});
```

- The thunk is **lazy** so **forward references** (target defined later) and
  **self references** (target is the entity being defined) both resolve after
  every table is built — drizzle wires FKs up at config time, not call time.
- A **self reference** needs the `AnyPgColumn` return annotation to break
  TypeScript's circular inference, mirroring the raw-drizzle precedent:
  `parentId: { references: { column: (): AnyPgColumn => labels.table.id, onDelete: "set null" } }`.
  A `set null` target column must be nullable (its field schema `ZodOptional` /
  `ZodNullable`), exactly as Postgres requires.
- `onDelete` / `onUpdate` take drizzle's `UpdateDeleteAction`
  (`"cascade" | "set null" | "restrict" | "no action" | "set default"`); omitted
  ⇒ NO ACTION (Postgres's default).
- **Composite-PK junctions** combine `primaryKey: ["a", "b"]` with a
  `references` on each column — see the unit test's `fk_message_labels`.

FKs touch only the DDL — never the select/insert row shape — so they are
deliberately absent from the `EntityColumns` cast (like `.primaryKey()`).

## Boundary casts

Exactly two casts cross the runtime/type boundary (the rest is precisely typed):
the per-builder `as any` for the modifier chain (`PgColumnBuilderBase` doesn't
surface chain methods), and `builders as unknown as EntityColumns<F>` so
`pgTable` infers the select type. The pgTable stays in `internal/`; only the
`defineEntity` factory + types leave via the barrel (cross-plugin imports of the
table are blocked by the boundary checker, like entity-extensions).

## Stage C scope

This plugin builds the primitive and unit-tests that it reproduces the exact
`slow_ops` DDL + wire schema. The live `slow_ops` table is NOT migrated here —
re-expressing it as a field record (and deleting its loader projection +
`Equal` guard) is Stage D. Registered with the `table-defs-in-schema-glob` check
so a stray `defineEntity(` outside a schema-glob file is flagged.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Derives a Drizzle pgTable AND a zod wire schema from one FieldsRecord, so entity.table.$inferSelect is identical by construction to z.infer<entity.schema>. Field-set drift becomes a tsc error; loaders drop their row projection.
- Server:
  - Uses: `fields.Fields`, `fields.resolveFieldStorage`
  - DB schema: `plugins/infra/plugins/entities/server/internal/define-entity.ts`
  - Exports: Types: `ColumnDefault`, `DbDefault`, `DefaultedKeys`, `Entity`, `EntityColumnMeta`, `EntityColumns`, `EntityMeta`, `EntityReference`, `EntityRow`; Values: `defaultNow`, `defaultRandom`, `defineEntity`, `sqlDefault`
- Cross-plugin:
  - Imported by: `debug/boot-profile`, `debug/slow-ops`

<!-- AUTOGENERATED:END -->
