# sql-projection

A raw SQL expression selected as a value carries a **decoder**, so its declared
type is derived from what actually runs.

```ts
import { nullable, parsed } from "@plugins/database/plugins/sql-projection/server";

qb.select({
  finishedAt: sql`CASE … END`.mapWith(nullable(pushes.createdAt)).as("finished_at"),
  //         ^? SQL<Date | null>, decoded by the same mapper as pushes.createdAt

  status: sql`CASE … END`.mapWith(parsed(TaskStatusSchema, "tasks_v.status")).as("status"),
  //      ^? SQL<TaskStatus>, and a value outside the enum throws

  active: sql`(${a} IS NULL OR ${b})`.mapWith(Boolean).as("active"),
  //      ^? SQL<boolean>
})
```

## Why this exists

In drizzle every **column** carries a decoder (`mapFromDriverValue`), so its
declared type and its runtime mapping come from the same object and cannot
disagree. A raw ``sql`…` `` projection is the one field kind whose decoder is
`noopDecoder` — the identity function. That is what makes ``sql<T>`…` `` a pure
assertion: whatever the driver decoded is handed to typed code as if it matched
`T`. `tsc` is satisfied, the code reads as typed, and a mismatch surfaces as
**wrong behaviour**, never as an error.

It is `sql-rows`' `pool.query<Row>(sql)` hole one layer down — inside the row
rather than around it — and it had already bitten. Three projections in this
repo declared `Date | null` over a `timestamptz` expression and held
`string | null`, because `drizzle-orm/node-postgres` returns timestamps as their
raw string and the `Date` mapping lives on the column type a raw projection does
not have. Nothing crashed, and that is the finding: the two server-side
consumers had each grown

```ts
const toDate = (v: Date | string) => (v instanceof Date ? v : new Date(v));
```

and routed **every** timestamp through it, including the ones that really were
`Date`s. A hedge like that is what an unverifiable type buys you. Both are gone.

## Which decoder

Pick the one that makes the declared type **true by construction**.

| the expression | decoder |
|---|---|
| *is* a column, or an aggregate / `CASE` over columns of one type | `.mapWith(thatColumn)` |
| …and can be `NULL` | `.mapWith(nullable(thatColumn))` |
| a composite shape — an array, a JSON object, a string-literal union | `.mapWith(parsed(schema, label))` |
| a plain scalar whose pg type is certain | `.mapWith(Boolean)` / `Number` / `String` |
| nobody has checked it yet | nothing — the projection is `SQL<unknown>`, which is honest |

`.mapWith(column)` is the strongest of the four: it reuses the exact decoder
drizzle applies to that column everywhere else, so the projection cannot drift
from the table it reads.

`parsed` is for the shapes coercion cannot express, and it is the incident
class. `array_agg` over a `name` column produces `name[]` (OID 1003), for which
`pg` has no decoder — so the whole array arrives as one raw Postgres literal
*string* where `string[]` was declared, and `for (const t of tables)` then walks
it one character at a time. `parsed(z.array(z.string()), …)` throws on that;
`.mapWith(String)` would not. See `sql-rows/CLAUDE.md` for the written-up
incident.

The three native coercions **coerce, they do not check** — `Boolean("{a,b}")` is
`true`. Use them only where the pg type already guarantees the JS type and there
is nothing narrower to say.

## Why `.mapWith` is the mechanism, and not a wrapper of our own

```ts
mapWith<TDecoder>(decoder: TDecoder): SQL<GetDecoderResult<TDecoder>>
```

The resulting type is **computed from the decoder**. It cannot be chosen
independently of what runs, which puts the sanctioned door on rung 1 of the
enforcement ladder — the wrong thing has no spelling through it. `parsed` and
`nullable` are only the two decoders drizzle does not ship; the mechanism is
drizzle's own.

Two consequences worth knowing:

- **`.mapWith` changes no SQL text.** A view body is byte-identical before and
  after, so there is no migration and nothing to rebuild beyond the usual
  derived-view boot pass.
- **A decoder attached in a `pgView` definition is the decoder every read uses.**
  `pgView(name).as(qb => …)` keeps the `SQL.Aliased` objects, and
  `SelectionProxyHandler` hands out `value.clone()` — a new alias over the *same*
  `SQL` object. So one edit in the view fixes every `db.select().from(view)` in
  the repo. (The converse: reading a view through raw
  ``db.execute(sql`SELECT …`)`` bypasses the decoder entirely, because the
  decoder lives in the JS view object, not in Postgres. That path is `sql-rows`'
  job.)

## A decoder never sees `null`

`mapResultRow` short-circuits before calling it:

```js
const value = rawValue === null ? null : decoder.mapFromDriverValue(rawValue);
```

So a decoder can make the **shape** true, but it can never police nullability —
that stays the author's claim. `nullable(d)` is how the claim is spelled, and it
exists because `GetDecoderResult<Column>` is the column's data type with no
`| null`. Its runtime null-guard is belt-and-braces; the type is the point.

Nullability has exactly **one** spelling: `parsed`'s `T extends {}` constraint
makes `parsed(z.string().nullable(), …)` a tsc error, so it is always
`nullable(parsed(schema, label))`.

## `label` is required

`parsed` throws from inside drizzle's result mapping, several frames from the
file that declared the projection, so the stack cannot say which projection
failed. Only the label can:

```
SqlProjectionError: a SQL projection did not match its declared shape.
  projection: tasks_v.dependencies
  expected array, received string
  value: "{_private_jobs,migrations,graphile_worker}"
  hint: the value arrived as a string — pg has no type parser registered for its
        Postgres type, so it is the raw Postgres literal. Cast the column
        (e.g. `::text[]`, `::int`, `::text`) or register a parser.
```

The hint fires only on the signature that means "no decoder" — a `string`
arriving where an array / object / number / boolean was expected. It is imported
from `sql-rows`, along with how a value is named and rendered: those are measured
facts about how `pg` decodes, and both halves of the boundary state them once.

`parsed` runs per row, so on a hot view prefer a column decoder where one
applies. (A few hundred nanoseconds against a view query measured in seconds —
guidance, not a budget.)

## The rule

`sql-projection/no-asserted-sql-type` reports the two spellings that let you name
a type without a decoder:

```ts
sql<T>`…`              // the type argument on the tag
sql`…`.as<T>("alias")  // drizzle's deprecated SQL.as<TData>(), identical
```

No exemption by shape. ``sql<string>`count(*)` `` is true only by luck (`int8`
decodes to a string, `int4` does not), and `.mapWith(String)` says the same thing
while making it true. The second spelling has zero occurrences today and is
banned anyway, for the reason `no-unparsed-sql-rows` keys on "rows were read"
rather than "a generic was written": closing one door only moves the author to
the other.

There is deliberately **no** rule demanding a decoder. Drop the type argument and
the projection is `SQL<unknown>` — honest, and unusable downstream without
handling it. `tsc` already asks for a decoder the moment you want a usable type.

The **column** twin of this rule is `sql-column` (`text(…).$type<Union>()`, a pure
assertion with no `.mapWith` to reach for) — see `plugins/database/CLAUDE.md` for
which of the three guardrails owns which spelling.

Design: `research/2026-08-25-database-mapped-sql-projections.md`.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Mapped raw-SQL projections: `parsed` / `nullable` turn a schema or a column into the decoder drizzle's `.mapWith()` derives a projection's type from, so a `sql` expression selected as a value can no longer declare a type nothing produces.
- Cross-plugin:
  - Imported by:
    - `conversations/session-chain`
    - `page/links`
    - `tasks/tasks-core`
- Server:
  - Exports (types):
    - `SqlDecoder`
    - `SqlDecoderLike`
    - `SqlProjectionFailure`
  - Exports (values):
    - `formatSqlProjectionError`
    - `nullable`
    - `parsed`
    - `SqlProjectionError`

<!-- AUTOGENERATED:END -->
