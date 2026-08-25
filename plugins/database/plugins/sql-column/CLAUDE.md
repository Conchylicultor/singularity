# sql-column

A column that narrows `text` to a set of values carries a **decoder**, so its
declared type is derived from what really runs — on every read *and* every write.

```ts
import { parsedText } from "@plugins/database/plugins/sql-column/server";

status: parsedText("status", JobWaitStatusSchema).notNull(),
//      ^? text column; select type = z.infer<typeof JobWaitStatusSchema>,
//         and that schema is what decodes it
```

## Why this exists

`text("status").$type<"a" | "b">()` changes **no runtime behaviour at all**. It is
a pure type assertion — which is what separates it from `.mapWith`, and why
`sql-projection`'s fix does not transfer: a column *is* drizzle's decoder rather
than something you attach one to.

The cost showed up as hedges. Two of the five original sites had grown a
`tolerantEnum(…)` wrapper on their **live-state resource** so a stale row would
not blank the whole pushed list. That guard sat on the *wire*, so it protected the
browser and nothing else, while two server-side readers went straight to the raw
column and did `MODEL_REGISTRY[id].cliFlag` on it. Moving the guard from the wire
down to the column is what reaches them.

## Strict or tolerant — the author picks

`parsedText` takes any `ZodParser<T>`, so both policies this repo already has are
spellable with nothing new:

| the value set | schema | on an unknown value |
|---|---|---|
| closed, private to one engine — an outsider is a bug | the strict `z.enum` | throw `SqlColumnError` |
| evolves — ids get renamed, old rows outlive them | `tolerantEnum(strict, normalize, report)` | normalize, and fire the deduped corruption report |

Tolerant is not a softer guardrail: it is the same rule applied to a set whose
members really do change. What both forbid is a type nobody checks. The
resource-level `StoredModelSchema` stays where it is — a WS payload has crossed a
process boundary and must validate on its own.

## Nullability is drizzle's, not the decoder's

No `nullable()` helper here (unlike `sql-projection`), because there is nothing to
spell. Drizzle derives nullability from `.notNull()` on the builder, and **a
decoder never sees `null`** in either direction — reads guard
`rawValue === null ? null : decode` (`utils.js:28`), writes guard the same on the
`Param` encoder (`sql/sql.js:131`). The decoder states the column's *shape* and
nothing else; handed a `null` it throws rather than absorbing it.

## One decoder, both directions

`fromDriver` and `toDriver` are the same schema — the column's claim is *its
values are exactly what this schema produces*, and stating it once means the two
directions cannot drift.

The write half is not redundant with `tsc`: a value laundered in through a cast,
a request body, or a tool argument is caught at the writer, where the stack names
the caller. The error says which direction failed, because the fix differs — a bad
**read** is a row to migrate or a schema to widen; a bad **write** is a boundary
that should have parsed. The encoder runs on INSERT `.values()`, UPDATE `.set()`,
and every bound comparison param (`eq`, `inArray`, …).

## What it costs

Measured end to end on the worst read that exists — the whole `conversations`
table (4 222 rows, 16 columns, 3 of them decoded) through real drizzle over the
live socket, arms interleaved A/B ×25 to hold host load equal:

```
plain   median 84.8 ms   p10 52.4 ms
decoded median 88.8 ms   p10 54.0 ms
overhead  +1.6 ms (p10)  …  +4.0 ms (median)   =  3–5 %,  ~123 ns per decoded value
```

`conversations` is the only unbounded, still-growing table whose loader reads it
whole; every other decoded read is bounded or keyset-paginated, so this is 3–5 %
on the worst case and sub-millisecond everywhere else.

The number that decides the *design*, though, is that decoding a column which is
**not** narrowed costs the same as decoding one that is (345 ns vs 322 ns per
value) for zero guarantee. That is why the text storage arm branches on the
schema rather than decoding every text column.

## Adopting it generates no migration

`getSQLType()` is `"text"`; drizzle-kit reads that into the snapshot with no
branch on the column class, and `"text"` is on its native-type whitelist, so it
renders unquoted. Byte-identical DDL and snapshot to `text("x")`, defaults
included (`.default()` stores the raw JS value and drizzle-kit reads it raw —
`toDriver` is never applied to a default).

Contrast the repo's other three `customType`s — `rank_text`, `bytea`, `tsvector` —
whose type names are *not* whitelisted and therefore render double-quoted.
`"text"` is the one that costs nothing.

## The qualified column name in the error

`PgCustomColumn.mapFromDriverValue(v)` is `this.mapFrom(v)` — a **method call** —
so a non-arrow `fromDriver` receives the built column as `this`, and the error can
say `job_waits.status` from inside drizzle's result mapping, where the stack says
nothing useful. That is measured behaviour, not a documented contract, so it
**degrades, never lies**: without the binding the message falls back to the bare
declared name, and `parsed-text.test.ts` pins the qualified form through a real
`pgTable` so a drizzle upgrade that detaches the call fails a test.

## The rule

`sql-column/no-asserted-column-type` reports both spellings that narrow a text
column without a decoder:

```ts
text("x").$type<T>()          // the assertion
text("x", { enum: [...] })    // the type derived from a runtime list
```

The second is *better* — the type comes from real data, so it cannot drift from an
unrelated type — but drizzle emits no `CHECK` for it, so the value is still
unverified.

Scoped by the chain's **root**: it fires only on a literal `text(` / `varchar(` /
`char(` call. Two things are left out on purpose, both filed as follow-ups:

- `jsonb(…).$type<T>()` — a materially weaker tier: pg really decodes JSON, so
  only the *shape* is asserted.
- ~~`defineEntity`'s generic `b.$type()`~~ — **done.** The fix was exactly where
  this predicted: the `fields.storage` capability now hands back a decoder rather
  than a bare builder, so every `enumTextField` column across the 30 entities is
  decoded by its own field schema and `b.$type()` is gone. See
  `research/2026-08-25-global-decoded-entity-columns.md` and
  `plugins/fields/plugins/text/plugins/storage`.

## Considered and rejected: `pgEnum` / `CHECK`

Strictly stronger — Postgres would refuse a non-member outright — but it makes the
value set a **schema migration**, and `ALTER TABLE … ALTER COLUMN … TYPE` against
live rows fails on any pre-existing out-of-set value across every worktree DB
fork. It is also incompatible with the tolerant policy the evolving columns need.
Worth revisiting per column for a set that is genuinely frozen.

Design: `research/2026-08-25-database-decoded-columns.md`.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Decoded columns: `parsedText` derives a text column's type from a zod schema that really decodes it — on every read and every write — so a column can no longer declare a string-literal union nothing verifies.
- Cross-plugin:
  - Imported by:
    - `apps/workflows/engine`
    - `conversations/conversation-category`
    - `conversations/conversation-progress`
    - `fields/text/storage`
    - `infra/jobs`
    - `tasks/auto-start`
    - `tasks/task-effort`
- Server:
  - Exports (types):
    - `SqlColumnDirection`
    - `SqlColumnFailure`
  - Exports (values):
    - `formatSqlColumnError`
    - `parsedText`
    - `SqlColumnError`

<!-- AUTOGENERATED:END -->
