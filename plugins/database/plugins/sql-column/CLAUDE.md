# sql-column

A column whose declared type is narrower than the Postgres type underneath it
carries a **decoder**, so that type is derived from what really runs — on every
read *and* every write. Two spellings, one per tier:

```ts
import { parsedText, parsedJson } from "@plugins/database/plugins/sql-column/server";

status:  parsedText("status", JobWaitStatusSchema).notNull(),
//       ^? text column;  select type = z.infer<typeof JobWaitStatusSchema>
callers: parsedJson("callers", z.array(CallerBreakdownSchema)).notNull(),
//       ^? jsonb column; select type = CallerBreakdown[]
```

In both cases the schema in the call is what decodes the column. There is no
second place to declare the type, so there is nothing for it to disagree with.

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

The jsonb tier is the same hole wearing a disguise. `jsonb("x").$type<T>()` at
least hands back a real JS value — Postgres genuinely decodes the JSON — so what
went unchecked was only the *shape*, which reads as mostly fine. It is not: a row
written by older code, by hand, or by a worktree on different code is handed to
typed code as if it matched `T`, and nothing in either direction ever looks.

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

## `parsedJson` — and why it normalizes

`parsedJson` is `parsedText`'s sibling: same `this`-bound `table.column` label,
same one-schema-both-directions claim, same nullability rule. Two things differ,
both forced by jsonb.

**It normalizes, it does not only check.** A `z.object` **strips keys it does not
declare**, on read and on write alike — so a row carrying a key from an older
schema comes back without it. That is the point rather than a side effect: it is
what makes the declared type *true* instead of merely asserted. Where every key
matters, the schema says so — `.passthrough()`, or a `z.record`, which keeps
every key by construction.

**There is no string-branch on read.** `pg` decodes jsonb itself
(`pg-types.getTypeParser(3802)` is `JSON.parse`), so `fromDriver` receives a JS
value and never a string. Drizzle's own `PgJsonb.mapFromDriverValue` re-parses a
string and, when that fails, **returns the raw string** — an absorbed failure,
and ambiguous besides, since a jsonb column may legitimately hold a JSON string.
The driver value goes straight to the schema instead: a string where an object
was declared is a loud failure naming the column. The write half is
`JSON.stringify` of the *parsed* value, which is what drizzle's own
`PgJsonb.mapToDriverValue` does.

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

### The schema is the dial

For jsonb the same question — should this be opt-in per field? — has the same
answer, for a sharper reason: **a zod parse costs what the schema's depth costs,
not what the payload's size costs.** So the dial already exists, and it is the
schema. A second knob could only disagree with it.

`traces.snapshot` is the largest jsonb value in the repo — 300 rows sampled: avg
123 KB, max 536 KB, in a table of 1 064 MB over 6 752 rows. Its schema is eight
scalars plus `events: z.record(z.unknown())`, because the engine deliberately
never names a key. Decoding one ~96 KB snapshot:

| decode | cost |
|---|---|
| `JSON.parse` — what pg already pays | 561 µs |
| the real, shallow schema | **1.7 µs** |
| a deep schema fully describing the same bytes, for contrast | 481 µs |

A schema that declines to describe a payload declines to pay for it: 0.3 % of
what pg already spends on the biggest blob in the repo. `z.unknown()` is 113 ns
and does not even clone — which is why `fields/json/plugins/storage` gives a
`z.unknown()` field a bare `jsonb` column and no decoder at all.

End to end, on the real reads:

| column set | per row | on its real read |
|---|---|---|
| `slow_ops.callers` + `waits` + `recentSamples` | 4.96 µs | +25 ms on the whole-table load (5 130 rows) |
| `mail_messages` ×6 jsonb columns | 3.97 µs | +0.12 ms on a 30-message thread |
| `traces.snapshot` | 1.7 µs | one row, on the detail pane only |

`slowOpsResource` is the only measurable one, and it is measurable for a reason
that predates the decoder: it is a legacy **unbounded** full-table push resource
that already loads ~19 MB and already parses every byte of it against the same
field schemas. It wants bounding, not a cheaper decoder. Everything else is
sub-millisecond.

## Adopting it generates no migration

`getSQLType()` is `"text"` / `"jsonb"`; drizzle-kit reads that into the snapshot
with no branch on the column class, and both are on its native-type whitelist, so
they render unquoted. Byte-identical DDL and snapshot to `text("x")` /
`jsonb("x")`, defaults included (`.default()` stores the raw JS value and
drizzle-kit reads it raw — `toDriver` is never applied to a default, and a jsonb
default is keyed on the same lowered type name either way, so it still renders
`'…'::jsonb`).

Contrast the repo's other three `customType`s — `rank_text`, `bytea`, `tsvector` —
whose type names are *not* whitelisted and therefore render double-quoted.
`"text"` and `"jsonb"` are the ones that cost nothing.

## The qualified column name in the error

`PgCustomColumn.mapFromDriverValue(v)` is `this.mapFrom(v)` — a **method call** —
so a non-arrow `fromDriver` receives the built column as `this`, and the error can
say `job_waits.status` from inside drizzle's result mapping, where the stack says
nothing useful. That is measured behaviour, not a documented contract, so it
**degrades, never lies**: without the binding the message falls back to the bare
declared name, and `parsed-text.test.ts` / `parsed-json.test.ts` each pin the
qualified form through a real `pgTable` so a drizzle upgrade that detaches the
call fails a test.

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
`char(` call. Two things are left out, one still open:

- `jsonb(…).$type<T>()` — still outside the rule, but **no longer because the
  tier is weaker**. `parsedJson` is now its replacement, and the rule should grow
  a `jsonb(` root. What gates that is the ~16 hand-written call sites
  (`reports.data`, `page_blocks.data`, `notifications.metadata`,
  `job_steps.result_json`, `backup_runs.manifest`, the workflow-engine and
  sonata-rhythm columns, …): several declare a TS type with no zod schema in
  existence, over load-bearing tables, so each needs its own schema written and
  its own live-data survey run first. The extension is gated on that migration,
  not on the tier.
- ~~`defineEntity`'s generic `b.$type()`~~ — **done**, and now for jsonb columns
  too. The fix was exactly where this predicted: the `fields.storage` capability
  hands back a decoder rather than a bare builder, so every `enumTextField`
  column and every `jsonField<T>` column across the 30 entities is decoded by its
  own field schema, and `b.$type()` is gone. See
  `plugins/fields/plugins/text/plugins/storage` and
  `plugins/fields/plugins/json/plugins/storage`.

## Considered and rejected: `pgEnum` / `CHECK`

Strictly stronger — Postgres would refuse a non-member outright — but it makes the
value set a **schema migration**, and `ALTER TABLE … ALTER COLUMN … TYPE` against
live rows fails on any pre-existing out-of-set value across every worktree DB
fork. It is also incompatible with the tolerant policy the evolving columns need.
Worth revisiting per column for a set that is genuinely frozen.

Design: `research/2026-08-25-database-decoded-columns.md` (the column tier),
`research/2026-08-25-global-decoded-entity-columns.md` (the entity tier), and
`research/2026-08-26-global-decoded-jsonb-entity-columns.md` (the jsonb tier).

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Decoded columns: `parsedText` / `parsedJson` derive a column's type from a zod schema that really decodes it — on every read and every write — so a column can no longer declare a string-literal union, or a jsonb shape, that nothing verifies.
- Cross-plugin:
  - Imported by:
    - `apps/workflows/engine`
    - `conversations/conversation-category`
    - `conversations/conversation-progress`
    - `fields/json/storage`
    - `fields/tags/storage`
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
    - `parsedJson`
    - `parsedText`
    - `SqlColumnError`

<!-- AUTOGENERATED:END -->
