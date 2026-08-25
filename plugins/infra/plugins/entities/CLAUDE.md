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
`fields/plugins/server-capabilities/server` (from which it imports
`resolveFieldStorage`). Its server barrel also side-effect-imports
`fields/plugins/server-capabilities-loader/server` so every storage capability
barrel is evaluated before any `defineEntity` body runs.

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

- **Columns** — `resolveFieldStorage(field.type.id)` gives the storage
  CONTRIBUTION, and the factory picks its arm (see below) and applies the
  modifiers (`.notNull()`, `.primaryKey()`, `.default()`). The DB column name is
  `meta.columns.<key>.name ?? snakeCase(key)` — a JS-prop-keyed `$inferSelect`
  is unaffected by snake_case (purely a DDL concern).
- **Schema** — `fieldsToZodObject(fields)`, keyed by the same JS props.

## The two storage arms — what is derived, what is asserted

A field type either has a **fixed** column (`build`) or one **narrowed by the
field's own schema** (`decode`), and `defineEntity` picks the arm:

```ts
storage.build ? storage.build(columnName) : storage.decode(columnName, value)
```

`value` is the field schema with its nullability peeled off (`splitNullability`),
because a decoder never sees `null` in either direction — drizzle guards it on
both — so handing it the `.nullable()` wrapper would make every real value fail
one half of the round trip. One helper returns both answers so the column's
declared nullability and its decoder cannot disagree.

That distinction is what the `EntityColumns` cast below now mostly *re-states*
rather than asserts:

| columns | the cast |
|---|---|
| every `text` field — so every `enumTextField` union | **DERIVED**: the builder was already typed off the schema that really decodes the column |
| `bool` / `int` / `float` / `date` / `uuid` / `rank` | **DERIVED**: the builder's type is pinned to its token's value type |
| every `jsonb` column (`jsonField<T>`, `tags`) | **ASSERTED**: Postgres really decodes the JSON, so only the SHAPE was ever claimed, and `T` comes from the cast and from nothing that runs |

The jsonb tier is a deliberate follow-up — measured at roughly a 2× multiplier on
that column's decode cost for a weaker guarantee, so it needs its own design
(`research/2026-08-25-global-decoded-entity-columns.md` §7).

The `b.$type()` call this factory used to make is gone: it was a runtime no-op
(`$type() { return this; }` in drizzle 0.36.4), and the type now comes from the
builder.

The precise select-type alignment is the one load-bearing cast:
`builders as unknown as EntityColumns<F>` fed to `pgTable`, which lets drizzle's
own `BuildColumns` infer the right select type. `EntityColumns` brands each
column with `$Type<…, InferFieldValue<F[K]>>` + `NotNull` — `$type` carries
nullability (`InferFieldValue` already encodes `T | null`), and `.default()` /
`.primaryKey()` are deliberately omitted from the cast (they affect only the
INSERT model, not select), keeping the select type exact.

## Nullability & defaults — two distinct concepts

- **Nullability** is derived from the RAW `field.schema` by `splitNullability`:
  a `ZodOptional` / `ZodNullable` (nested to any depth) leaves the column
  nullable; anything else gets `.notNull()`. Deriving it from the schema is what
  prevents wire/column nullability drift — and the same call yields the value
  schema a decoding storage arm is handed, so those two cannot drift either.
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
  - Uses:
    - `fields/server-capabilities-loader`
    - `fields/server-capabilities.resolveFieldStorage`
  - DB schema: `plugins/infra/plugins/entities/server/internal/define-entity.ts`
  - Exports (types):
    - `ColumnDefault`
    - `DbDefault`
    - `DefaultedKeys`
    - `Entity`
    - `EntityColumnMeta`
    - `EntityColumns`
    - `EntityMeta`
    - `EntityReference`
    - `EntityRow`
    - `ServerOnlyKeys`
  - Exports (values):
    - `defaultNow`
    - `defaultRandom`
    - `defineEntity`
    - `sqlDefault`
- Core:
  - Uses: `fields.fieldsToZodObject`
  - Exports (values): `wireSchema`
- Cross-plugin:
  - Imported by:
    - `apps/browser/bookmarks`
    - `apps/events/events-core`
    - `apps/mail/mail-core`
    - `apps/sonata/library`
    - `apps/sonata/track-mixer`
    - `apps/story/generation`
    - `conversations/session-chain`
    - `conversations/summary`
    - `debug/boot-profile`
    - `debug/slow-ops`
    - `debug/trace/engine`
    - `infra/claude-cli`
    - `infra/events`
    - `plugin-meta/plugin-health`
    - `tasks/tasks-core`

<!-- AUTOGENERATED:END -->
