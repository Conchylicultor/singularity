# query-resource

The SQL compiler under `network/live`'s live-resource API. **It is not a way to
declare a resource.** A new collection is a `liveCollection` served by
`serveCollection`, and a new value is a `liveValue` served by `serveValue` —
see `plugins/network/plugins/live/CLAUDE.md`. What lives here is what those
compile to, plus the last resources that have not moved:

- **`windowQueryResource`** — the bounded (window / point) compiler.
  `serveCollection` runs every collection's window and `:rows` sibling through
  it (see *Bounded membership* below).
- **`compileGroupsQuery`** — the grouping compiler: a collection's `:groups`
  sibling (see *Routes* below).
- **`queryResource`** + **`queryResourceDescriptor`** — the unbounded keyed
  form. Only the task tree's resources still use it (`tasks`,
  `conversations-active` / `-system`, and `task-categories`, bounded by
  `tasks`). They wait for the design for loading part of a tree
  (`research/2026-09-25-global-unified-live-resource-api.md`, *Phases after the
  proof*). `rel()` / `compileEdges` derive that tree's cascade edges.

`query-resource` never imports `network/live` — the dependency runs the other
way, test files included.

Both compilers take ONE constrained drizzle declaration and derive the FULL
loader, the Layer-2 scoped loader, the scope policy (`queryResource`: the
`identityTable`, hand-authored elsewhere and free to drift from what the loader
actually reads; `windowQueryResource`: the ROUTES — see *Routes*), and the client
keyField — producing exactly the object the two-arg keyed
`defineResource(descriptor, KeyedServerResourceOptions & ScopePolicy)` already
accepts (a keyed contract takes no `mode`).

## Routes: the bounded and grouping compilers emit what their SQL reads

`windowQueryResource` and `compileGroupsQuery` are **routed**
(`research/2026-09-29-global-scoped-change-routing.md`, P1): instead of an
`identityTable`, each emits, from the same declaration it renders the SQL from,
the `RoutePlan` the runtime's `routeTableChange` serves it by (`internal/routes.ts`):

- **window / point** — `routes`: an `identity` route (`base`) on the base table,
  read by every tuple in the `membership` role, plus one route per declared join
  (see *Joins*). When the identity pk IS the table's primary key the change
  feed's ids are the host ids as they stand; otherwise the route reads the pk
  column off the change's key layout (`tableLayoutRequirements` carries every
  map `column`, so the routed trigger sends it) — scoped as well.
- **grouping** — `reach` (the non-keyed arm): one `full` route per relation (the
  base table, and each join). A write to a table a grouping reads recomputes it;
  a write to any other table reaches none.
- A route's `columns` (what the `unchanged` gate skips on, P4) are exactly the columns of
  its table the compiled SQL may reference over every tuple — projection,
  identity, join conditions, a static `where`, the declared per-params `where`
  columns (`whereReads` on the window spec, `reads` on the grouping spec) and
  the order signature. A function `where` with no declared universe makes them
  every column of every relation (the safe over-approximation); with one, each
  tuple's `where` is checked against it and a column outside throws.
- **A routed compile reads a base table, never a view** (A1): a change arrives
  under its base tables' names, which no route of a view can state. The spec's
  `from` is typed `RoutedSource` (`PgTable | EntitySource`), and an untyped view
  throws at module eval. The change-feed's boot assertion checks every route table
  is triggered (`change-feed/server/internal/route-coverage.ts`).
- **No `rel()` edges** on a bounded spec: a routed entry is never a cascade
  upstream, and routes the tables it reads itself (the runtime refuses `dependsOn`
  beside `routes` / `reach`).
- **`internal/routes.ts` is the one production minter.** A plan is made by
  `mintRoutePlan` / `mintReachPlan` (resource-runtime), never written as a literal
  (a type brand), and the `resource-runtime:compiled-routes` check allows the
  minters only there and in test code: a route's `columns` gate which updates reach
  the resource, so only the code that renders the SQL may state them.
- The runtime's drift guard (A8) checks each loader run's captured tables against
  the route tables, so a compiler that forgets a table fails its tests loudly.

## Joins: provenance-driven read-sets (`core/internal/joins.ts`, `server/internal/joins.ts`)

A bounded or grouping compile reads its base table plus declared **joins, as
data** (`JoinSpec`, in `core/`, type-only so the browser bundle pulls no
drizzle):

| Kind | Join | Route |
|---|---|---|
| `extension` — a 1:1 side table (`infra/entity-extensions`' `ext.join(alias)`) | LEFT, `key = parentKey` (the host id) | `alias` on the side table's pk: a side I / U / D is a host U |
| `lookup` — N:1 on `pk`, `on` a column of the base or an EARLIER join (chainable) | INNER when `required`, else LEFT | `reverse` on `pk` (see *Reverse routes*), or `alias` when `on` is the host identity |
| `keyed-side` — a composite-keyed side table (`hostKey` + fixed `selectors` covering its pk) | LEFT, on the host identity (compared as `hostKey`'s type) | `alias` on `hostKey`, `rows` = the selectors — scoped on the routed trigger's key layout |

- **Every join renders against its alias** (`"playback"."last_played_at"`), so
  the relation a column belongs to is read off the SQL itself. `compileJoins`
  (`server/internal/joins.ts`) renders and checks the specs, and walks any SQL
  fragment for the relations it reads (`columnsIn` / `relationsIn`); a relation
  that is neither the base nor a declared join throws ("declare it as a join").
  Raw `sql.raw` text carries no column objects and is invisible to the walk — a
  routed compile's SQL is built from drizzle columns.
- **A tuple reads a join** when its SQL references it: projected, a required
  lookup, named by its `where` / order, or hung off by one that is. Every shape
  of that tuple — full, scoped refill, `windowIdsOf`, point, grouping — joins
  exactly those relations, and `usesOf(params)` names exactly them, so the
  loader and the membership authority read one relation set (the provenance
  property test in `network/live`'s `serve-collection-joins.test.ts`).
- **Role.** A join is `membership` for a tuple when it is required (INNER) or its
  `where` / order reads it — directly or through a later join in its chain (the
  chain's ancestors too); otherwise `value` (a LEFT join that is only projected).
  A membership use (the base's included) also carries **`moves`**: the columns of
  its table whose change can move that tuple — its `where` and order columns,
  and the conditions of the joins it reads as membership. A `U` touching none of
  them is a value change for the tuple (`resource-runtime`'s `TupleUse.moves`):
  an event's title edit reaches only the windows holding it, a source's config
  edit resolves within the members.
  The runtime drops a value-role write to a row the tuple does not hold, while
  the tuple is quiescent (`resource-runtime`'s quiescence guard). A grouping
  joins only what its grouped column and `where` read (plus required lookups),
  and every use is `membership`.
- **A4 — checked at module eval:** a `ColumnRef.col` belongs to the relation
  `from` names; a lookup's `on` names an earlier relation, and its `pk` is its
  table's primary key or unique; a keyed side's `hostKey` + selectors cover its
  primary key; an extension hangs off the base table, its key is its own
  primary key and its parent key the resource's identity; aliases are unique and
  never `base` or the base table's name; a join needs an explicit `select`; the
  key field projects the base identity; a joined sortable column is projected and
  in the order signature (matched by relation AND name, so a join's `created_at`
  is never the base's). A column a LEFT join reads is NULL for a host with no
  joined row, so it orders as nullable.
- **T2 — types:** a column override returns one of the refs its `j` offers
  (`JoinRef<JoinRefs<…>>`: `j.<relation>.<column>` is a `TypedColumnRef` naming
  both), so an undeclared relation, another table's column, or a server-only
  column is a tsc error. `j` offers each relation's WIRE columns: the base
  source's (an entity's `wireColumns`), and a join's `wireColumns` when it
  carries them (an extension handle's `join()` does), else its table's columns.
  A lookup's `on` stays a plain `ColumnRef`, checked by A4.
- **A spec with no `select`** (a select-all) projects every column of its
  source, so its route columns are all of them — the exact-columns rule reads
  the projection, never only the declared `select`.
- **A missing extension row reads its defaults** (`ReadColumn`): an EXTENSION
  join's column whose table column declares a literal default (drizzle's
  `.default(value)` — an entity extension's meta `default`) renders as
  `COALESCE("alias"."col", <default>)` wherever the SQL reads it — the
  projection, a filter, an order key, a cut. An extension row that does not
  exist means its declared defaults, so a never-played song has `playCount = 0`
  in SQL. Such a column is never NULL (`JoinPlan.canBeNull`: non-nullable keyset
  keys, exempt from the LEFT-join nullable-field rule); its provenance is still
  the alias column (`columnOf`, a module-level map, so a plan handed another
  plan's rendered columns still reads them). A join CONDITION always compares the
  raw stored key, and a static predicate's `j` (`JoinPlan.columns()`) offers the
  raw columns — a predicate states its own NULL handling. A computed default
  (`defaultNow()`, SQL) is never coalesced.
- `QueryDb`'s step gains `leftJoin` / `innerJoin`; `server/testing`'s
  `recordingQueryDb` is the fake that renders every query through drizzle's real
  dialect.

### Expression fields — `ExprField` (`core/internal/expr.ts`)

A row field computed by a SQL expression binds where a column override does,
over the same `j`: `(j) => expr(sql\`upper(${j.artist.name})\`, { decoder,
sqlType, notNull?, serverOnly?, wire? })` (network/live's `serveCollection`
`columns`; the union arms and the persisted alias reuse it). `expr` is published
from the core barrel (the run arms' labels and outcomes are the first shipping
declarations).

- **`j`'s refs render.** Each `j.<relation>.<column>` is also a SQL fragment
  (`joinRefs`' `getSQL`): the relation's DEFAULTED wire column (an extension
  column's COALESCE). A server-only base column is named by the table's own
  column and declared in `serverOnly`.
- **Rendered once per compile** (`JoinPlan.renderExpr`): `(<sql>)` with the
  decoder `.mapWith`'d, registered in the module-level `readExpressions` (now a
  union: `column` — a defaulted / member read standing for one column — or
  `expr`), so every plan recognises the SQL object: `canBeNull` is
  `!notNull`, `sqlTypeOf` its `sqlType` (a cut's cast), `nameOf` its field
  name. `columnOf` / `relationOf` THROW on an expression (it reads no one
  column); callers use `nameOf` / `memberOf` / `relationKey` / `relationsIn`.
- **Provenance is read off the SQL** (`columnsIn`): its columns are route
  columns like a projected one's, an order or filter over a lookup it reads makes
  the lookup membership, and a relation that is neither the base nor a declared
  join throws — a correlated subquery over an undeclared table cannot be
  written. A column that is neither a wire column of its relation nor a
  declared `serverOnly` one throws; so does an expression that is exactly one
  column (bind a column override), and an `sqlType` outside `SQL_TYPE_RE`
  (checked by `expr` and again by `renderExpr`).
- **Unforgeable.** An `ExprField` carries an unexported brand only `expr` sets:
  an object literal cannot spell one (tsc), and `isExprField` reads the brand,
  not `kind`.
- **Value type.** `V` is the decoder's result, `| null` unless `notNull: true`,
  or the `wire` codec's output; the binding's return type must be an
  `ExprField<Row[K]>` (tsc), and serveCollection backstops a nullable
  expression on a non-null field at module eval. Never the id.

### Raw execution — `QueryDb.execute`

`QueryDb extends SqlExecutable<SQL>` (sql-rows): drizzle's raw `execute`, for
the shapes the builder cannot render (a union with expression order keys — drizzle's
`unionAll` rewrites column chunks to bare identifiers —, a recursive CTE). Every
raw read goes through `executeRows(db, { query, row: decodedRow(…), label })`
(sql-projection), so its rows decode like a builder's. `recordingQueryDb`
records `execute` too and answers a full `SqlResult`.

### Reverse routes — a lookup's changes, resolved to hosts (P4)

A lookup is joined N:1 from the host side, so a change to a looked-up row names
the ROW, not its hosts: its route is `reverse` on the lookup's `pk`, and its
`resolve(changed, within, cap)` (`server/internal/joins.ts`, `reverseMap`) is the
probe the runtime runs in the drain, once per flush:

```sql
SELECT DISTINCT <host pk> FROM <base> [the joins up to `on`'s relation]
 WHERE <on> = ANY($changed::<type>[]) [AND <host pk> = ANY($within::<type>[])]
 LIMIT cap + 1                       -- more than cap ⇒ "over-cap" (the readers go FULL)
```

- **One array param per list**, cast to the column's own type, so the column's
  index serves the probe and the statement is one shape whatever the count.
- **A10 — the FK-direction rule.** Resolved after commit, the probe is complete
  when it reads only HOST-side rows: the base (a self-join too — `nodes.parent_id`
  of the host rows) or earlier joins over OTHER tables. The referencing column is
  still there whatever happened to the looked-up row (a deleted source's events
  still name it), and a host row that moved its own key is a change of its own
  table, routed by its own route. A chain whose hop is a join over the CHANGED
  table itself would read the post-image of the very rows that changed; that
  route is `full`, reason `pre-image needed: …` (listed by the Read-set pane).
- A tuple reads the lookup as `membership` (required, or filtered / sorted by it)
  — resolved unbounded — or `value` — resolved within its members; `moves` turns a
  `U` of the lookup's projected-only columns into the latter.
- **Host ids are the pk's own values.** The probe answers the host pk as it is
  stored and reads `within` the same way. A single compile's routes are
  `RawRoute`s — an `identity` / `alias` map cannot carry `encode` (T10, a tsc
  error) — so `compiledRoutePlan` mints one key space. A union re-keys its
  arms through `compiledUnionRoutePlan` (below), which encodes the reverse
  answer and decodes `within` together with the identity.
- **The probe does not apply the collection's predicates** (base `where`,
  default scopes): hosts no tuple can hold count toward the cap. A default is
  per tuple, and a predicate reading the looked-up row must not filter the
  post-image (a disabled source's events are exactly the ones to exit), so a
  host-only static predicate is the one that could be ANDed in — no collection
  has one beside a lookup yet.
- The grouping compiler's routes stay `full` (a count has no hosts); a keyed
  side's `full` route there carries its selectors as `rows`, so a write to
  another scope's or member's rows moves no count.

### Union route plans — `compiledUnionRoutePlan` (P6)

A union window lists N arms (tables) in one `kind:raw` key space
(`armKeyCodec(kind)`, core: `encode` = `kind:raw`, `decode` strips the prefix
once — a raw id may contain `:` — and answers `null` for another arm's key;
`KIND_RE` is what a kind may be). `armKeySql(kind, idCol)` (server) is the SQL
that projects the same key, tested byte-equal to `encode` against Postgres.
`compiledUnionRoutePlan(arms, usesOf)` mints the union's plan from each arm's
raw routes:

- route ids are prefixed — the base `<kind>`, any other `<kind>.<id>` — and
  must be unique, kinds too (A14); an arm's `identity` route carries no
  `column` (an arm's raw id is its table's single-column pk);
- `identity` and `alias` maps gain the arm's `encode`;
- a `reverse` map's `resolve` decodes `within` to that arm's raw ids (another
  arm's keys dropped; none left ⇒ no probe), passes `within: null` (an
  unbounded reader) through, and encodes the answer; `"over-cap"` passes
  through;
- `full` is unchanged. `usesOf` answers in the prefixed ids.

### Union collections — `compileUnionCollection` (P6)

The compiler behind network/live's `serveUnionCollection`
(`internal/compile-union-window.ts`): N ARMS — a table each, its id its
single-column primary key — listed as one collection in one key space
(`kind:raw`). It returns the three server halves a `liveCollection({ arms })`
mints (window, `:rows`, `:groups`). It knows tables, joins, SQL and routes; the
filter language (which arms a tuple keeps, an arm's compiled `where`) and the
row's wire shape are the caller's.

- **Routed per arm, rendered positionally.** Each arm is routed exactly as a
  single-table compile is (`routedReads`, `arm-plan.ts`' routed half: its
  base `identity`, one route per join, each gated by the columns its SQL reads,
  `moves` from its `where` and order) and re-keyed by `compiledUnionRoutePlan`;
  `usesOf` answers only the tuple's surviving arms. The SQL is rendered here —
  every arm projects `__kind`, `__key` (`armKeySql`) and `__c<i>` (its read, or
  `NULL::<sqlType>`) — and run raw through `QueryDb.execute`, each row decoded
  by its own arm's decoders (`decodedRow`, dispatched on `__kind`).
- **Shapes.** Full: per surviving arm `SELECT … WHERE arm.where ∧ whereOf ∧ cut
  ORDER BY … LIMIT n`, `UNION ALL`, re-ordered and re-limited outside (zero arms:
  a typed `WHERE false` scaffold). Scoped refill: keys decoded per arm (another
  arm's or an undecodable one dropped), `pk = ANY`, no order. `windowIdsOf`: the
  full shape projecting the key and the order columns. Point (`:rows`): grouped
  by kind over every arm, `arm.where` kept; an unknown kind is absent, never a
  contract error. Groups: a per-arm `GROUP BY 1` (a constant arm groups as one
  value), summed outside, `full` routes per arm.
- **Static nullability.** A column is nullable when ANY registered arm reads
  NULL for it — computed once at bind, never per surviving arm, so a cut and a
  signature never depend on what a tuple pruned.
- **Total order.** The tuple's keys, then the row key. Inside an arm a constant
  key orders nothing and is dropped from its ORDER BY, but the cut (keyset
  `seekPredicate` / `atOrBeforePredicate`) runs over every key, constants
  included, each operand cast to the column's type. The scroll row key is the
  outer `u."__c<i>"::text` of each key — the union's own text.
- **A14 at bind:** kinds unique and `KIND_RE`; `id` the base table's
  single-column primary key; every column's `sqlType` a type name, and every
  arm's read of it producing that type (`canonicalSqlType` folds
  `timestamptz` / `timestamp with time zone`, `int4` / `integer`, …); the key
  field and the discriminator never a bound column. Unit suite:
  `server/internal/compile-union-window.test.ts`.

### Join families — members joined per tuple (P3)

A **`JoinFamily`** (`core/`) is a composite-keyed side table whose set of
MEMBERS is data, not code — a DataView surface's custom columns: `hostKey` +
fixed `selectors` (the surface) + a `member` column (`column_id`) + the `value`
each member reads. A window spec takes them as `families: { joins, valuesKey }`
(window kind only).

- **A member is a keyed-side join** (`familyMember(family, m)`, alias
  `familyMemberAlias(id, m)` — injective: every character outside `[A-Za-z0-9]` is
  spelled `_<hex>_`; a spelling past Postgres's 63-byte identifier limit becomes
  `<id>___h<128-bit hash>`, a form no spelled alias can take, and two members
  meeting on one alias fail the compile). The caller renders a member's value through its plan
  (`JoinPlan.readMember(familyId, m, read?)`, compiled on first use; `read` is a
  cast and the SQL type it produces), and every plan over the same family object
  finds that member again by its alias (a module-level registry, like the
  defaulted-column one), so the plan that applies a tuple's joins knows it.
- **A tuple joins exactly the members its `where` / order names** (read off its
  SQL like any join), as `membership`. ONE route serves the whole family
  (`familyRoute`): an `alias` on `hostKey`, `rows` = the selectors, `match` on the
  member column; a tuple's use matches the members it reads, so a write to
  another member, or another scope's rows, reaches no tuple.
- **A member the tuple orders by is projected** (`__family_<i>`) and folded into
  `row[valuesKey]` by join alias, where its order signature reads it (the
  signature universe `signatureColumns` is static; members are not in it).
  `whereReads` does not apply to members: their route's columns are the family's.
- A cast member's scroll cut casts back through the expression's own SQL type
  (`JoinPlan.sqlTypeOf`), not its raw column's. A per-tuple order is memoized by
  its keys' RENDERING (an expression key by its object and SQL type), not by
  relation and column name — a retyped member keeps its alias and column but
  reads through a new cast, so its ORDER BY, `__family_<i>` projection and cut
  casts follow the retype on the next load.
- **`recomputeOn`** on the spec is handed to the runtime as the routed entry's
  `recomputeOn`: an external value tuple whose change moved the family's members
  (a column added, dropped, retyped) FULLs every subscribed tuple and drops its
  read-set memo.

The tree resources are declared like this — kept for them, **not** a precedent
for new work:

```ts
// shared/ (web-safe descriptor — NO drizzle):
export const taskCategoriesResource = queryResourceDescriptor(
  "task-categories", TaskCategoryRowSchema, "taskId", { preload: "boot" });

// server:
export const taskCategoriesServerResource = queryResource(taskCategoriesResource, {
  from: tasksCategory,                       // PgTable | PgView | Entity
  // scopedMembership: true,                 — INSERT/DELETE ship incremental deltas (§ scopedMembership)
});
```

> `where` (and mutable-column filtering) is covered in the RULE section below.

## What it derives

1. **Identity.** `Entity` → base = `entity.name`, pk = its table's single primary,
   projection = `wireColumns`; `PgTable` → base = its table name, pk = its single
   primary, select-all; `PgView` → **requires** `identity.pk` + `identity.table`
   (matching the view's `View({ view, identityTable })` declaration), because a
   view has no PK metadata and its identity base cannot be derived at module eval
   — before the boot-time contribution collection that populates
   `relationIdentityBase`. A composite / missing PK with no `identity.pk` override
   throws; such a payload is a pushed `liveValue` (`network/live`) instead.
2. **keyField.** The wire field the client `keyOf` reads: the projection key whose
   column matches the pk (matched by DB column *name*, so an aliased projection
   `{ conversationId: table.parentId }` keys on the alias), else the pk's JS
   property name. Throws if the pk is not projected, or if the descriptor's
   `queryPk` disagrees with it.
3. **FULL loader.** `select(map).from(rel)[.where][.orderBy][.limit]`.
4. **Scoped loader.** The same select/where composed with
   `and(where, pk IN (affectedIds))` and **no orderBy/limit** — a partial refill
   of only the changed rows. Fires only under the `identityTable` policy.
5. **ScopePolicy.** `{ identityTable }` by default; `{ recompute: {kind:"full"} }`
   when `spec.recompute` is set. Never both, never neither.

## Keyed-only, and why push is excluded

The compiler emits **keyed resources only**: a push loader that ignored
`ctx.affectedIds` would broadcast a partial (scoped) array as the whole value,
corrupting every subscriber's snapshot. Keyed-ness comes solely from the client
descriptor (`queryResourceDescriptor` → `keyedResourceDescriptor`), so the scope
policy is mandatory by construction. A pushed or on-demand payload is a
`liveValue` served by `serveValue` (`network/live`).

## The `recompute: {full}` escape hatch (K/full)

Windowed reads (`orderBy … LIMIT N`) can't be scoped: a row entering or leaving the
window is a *membership* change a per-id refill can't express, and a scoped refill
of an out-of-window row would corrupt the snapshot. Declare
`recompute: { kind: "full", reason }` — the loader always runs the FULL query and
ignores `ctx.affectedIds`, while still gaining Layer-1 keyed row diffing.

## RULE: a mutable-column `where` requires `scopedMembership` or `recompute:{full}`

**`where` + the plain `identityTable` scoping is sound only when every column the
`where` reads is immutable post-insert.** The scoped refill runs
`and(where, pk IN affectedIds)`, but `diffKeyedScoped` **never emits deletes** (a
scoped notify never asserts membership) — so an UPDATE that flips a row out of the
`where` merges nothing, and the excluded row sits **stale in every client
snapshot** until the next FULL recompute. A correctness bug, not a staleness nit;
column mutability is not statically detectable, so this rule is checked at review
time:

- `where` on **immutable** columns (a parent FK like `threadId`, a fixed `type`
  discriminator, anything never UPDATEd) → plain K/scoped is fine.
- `where` on a **mutable** column (`dismissed`, a status, any flag a mutation
  flips) → declare EITHER **`scopedMembership: true`** (M5, preferred for a
  non-windowed scan: the flip is detected as a membership **exit** and shipped as
  a real delete + `order`, so the row leaves incrementally — see the next
  section) OR **`recompute: { kind: "full", reason: "where-filtered membership:
  …" }`** (the fallback for windowed reads, which cannot membership-scope; the
  FULL loader's `diffKeyedFull` ships the disappearance as a per-row delete,
  while in-place flips still ship as single-row upserts).
- No `where` at all → membership only changes via INSERT/DELETE. Without
  `scopedMembership` the feed delivers those as FULL (`op: "I" | "D"`); with it
  they ship incrementally. Either is correct.

## `scopedMembership: true` — incremental membership (M5)

Opt a **non-windowed** keyed scan into row-level membership scoping so an
INSERT / DELETE / where-flip no longer forces a FULL recompute. The compiler
derives, alongside the FULL + scoped loaders, an **`orderOf`** query — the
ids-only `select(pk).from(rel)[.where][.orderBy]` (**never a limit**) — and emits
`scopedMembership: { orderOf }` into `serverOpts`. The runtime reconciles each
flush's changed ids against the per-pk snapshot (delete / where-flip exit → delete
+ `order` derived from the in-memory snapshot; entry → upsert + `order` with
`orderOf` run exactly once; in-place flip → one upsert, no `order`): see the
runtime section in `plugins/framework/plugins/resource-runtime/CLAUDE.md`. Cost
model: `orderOf` runs **only when a row enters** membership, so the common
status-flip path issues no extra query.

`scopedMembership` cannot combine with `limit` (a windowed read cannot
membership-scope) or `recompute` (the opposite policy — no `identityTable`): loud
throw in `compileQuery`. Absent ⇒ byte-identical to pre-M5. Design:
`research/2026-07-03-global-scoped-membership-m5.md`.

## Bounded membership: `windowQueryResource` (window / point)

`serveCollection` (`network/live`) compiles every collection through here, and
a bounded resource is declared and served only that way: the two descriptor
kinds this compiler takes are minted by `liveCollection` alone (their factories
are internal to `network/live`). This plugin keeps just the contract TYPES the
compiler consumes — `WindowQueryResourceContract` / `PointQueryResourceContract`
in `core/`. The compiler's tests therefore live beside `serveCollection`, in
`network/live/server/internal/` (`compile-window.test.ts`,
`compile-window-runtime.test.ts`), and reach `compileWindowQuery` through this
plugin's `server/testing` barrel; a test here importing `network/live` would
close an import cycle.

**Arms and assembly.** The compile is split in two (`internal/arm-plan.ts`,
`internal/compile-window.ts`). `planArm` plans ONE relation set — identity,
joins, projection, routes, each tuple's reads (`tuple(params)`: where,
included joins, uses with `moves`), the order (plan, cuts, signature parts) and
the SQL each shape renders (`fullQuery` / `scopedQuery` / `idsQuery` /
`pointQuery`, rendered, never executed) plus `fold` — as an `ArmPlan` whose
`mode` is `window` or `point`. `assembleWindow` / `assemblePoint` own the rest:
the signature-field list (every arm must project the same field per signature
column), the clamped limit, the loaders, `windowIdsOf`, the membership and the
scope policy. The spec's own guards (kind, codec, `orderBy`, limits, a function
order's `signatureColumns`) run before `planArm`. A single-table spec is the
1-arm case. The union compiler (*Union collections*) reuses the arm's routed
half (`routedReads`) and renders its own positional SQL; the persisted alias
(P8) consumes the contract in mode `all`. The grouping compiler splits the same way: `planGroupArm` and
`compileArmGroups`, with `compileGroupsQuery` the 1-arm case.

The split is pinned byte for byte by `network/live`'s
`server/internal/compile-sql-golden.test.ts`: a fixed matrix of declarations
(`network/live/server/testing/compile-sql-golden.ts`) whose every shape's SQL
and params, routes, `usesOf`, signatures, folded rows and per-tuple
`where` / `orderBy` resolutions must equal
`network/live/server/testing/compile-sql-golden.json`. The test only reads the
fixture; a deliberate SQL change regenerates it with
`./singularity run plugins/network/plugins/live/server/testing/gen-compile-golden.ts`
and reviews its diff.

The bounded-working-set sibling of `queryResource`: the subscription's params tuple
names a **bounded selector**, so a change costs O(changed) + O(window), never
O(collection), and the value is never the whole table. Two kinds, one compiler —
exactly ONE of `window` / `point` per spec, matching the descriptor kind. What
`serveCollection` derives for a collection `c` over a table (never written by
hand):

```ts
windowQueryResource(c.window, {
  from: table,
  select,                                    // exactly the row schema's keys
  where: (params) => and(base, filterSql(decoded.where)),
  orderBy: (params) => decoded.orderBy,      // { col, dir, nullable }[], per tuple
  signatureColumns,                          // every sortable column
  window: {},                                // maxLimit rides the descriptor's codec
});
windowQueryResource(c.rows, {
  from: table,
  select,
  where: base,                               // the collection's base membership, if any
  point: { by: table.id },                   // IS the identity pk
});
// web: useLive(c) → Row[] at the default window; useLiveRow(c, id) → pending /
//      found / not found, O(1), no .find(); useLive(c, { ids }) → Row[] for a set.
```

What the compiler derives per kind (both kinds also emit their identity route —
see *Routes* above):

- **window** — the windowed FULL loader (`where → ORDER BY → LIMIT`, the limit
  decoded from the params via the descriptor codec and clamped to `maxLimit`),
  the Layer-2 scoped refill (`pk IN affectedIds`, no order/limit), `windowIdsOf`
  (the ids-only windowed query — same where/order/limit as the loader, so the
  membership authority cannot drift from it), and `orderSignatureOf`, emitted as
  `membership: { kind: "window", windowIdsOf, orderSignatureOf }`. `orderBy` is
  `{ col, dir }` pairs, not raw SQL: the compiler appends the pk tiebreaker (a
  window must be a prefix of a strict total order) and renders explicit
  `NULLS LAST`, and a future cursor derives its keyset seek
  (`primitives/keyset`) from the same keys.
- **point** — the loader as a scoped read over `ctx?.affectedIds ??
  point.decode(params)` (an empty set short-circuits to `[]`, no query),
  emitted as `membership: { kind: "point", idsOf: point.decode }`. `point.by`
  **is** the identity pk — the change-feed routes by intersecting changed
  identity ids with each tuple's set, so any other column could never
  intersect (declaring both `identity.pk` and a different `by` throws).

**Client-chosen order (`orderBy` as a function).** `orderBy` may be
`(params) => WindowOrderKey[]`, like `where`: each subscription tuple sorts by
the order its own params resolve (the rendered ORDER BY is memoized per
canonical order; the pk tiebreaker and NULLS LAST are still appended). A
function `orderBy` **requires `signatureColumns`** — the union of every column it
may sort by, each projected. The order signature is **per tuple**:
`orderSignatureOf(row, params)` covers only the columns that tuple orders by,
cut from `signatureColumns`, so an UPDATE to a column re-derives the windows of
the tuples sorting by it (one bounded ids query each) and costs a tuple sorting
by another column nothing — a playback write under a `title` sort stays on the
in-place path. A resolved order column outside `signatureColumns` throws on
first use; a static `orderBy` may pass `signatureColumns` too (it must cover the
declared order columns; the signature is still the order's own columns). A
richer window codec may carry extra params keys (`{ limit; where?; order? }`) — descriptor, contract and compiler are
generic over `P extends WindowParams` — and may carry `window.maxLimit` on the
descriptor instead of the spec (both given ⇒ must be equal; neither ⇒ throw).

**Order-column updates are HANDLED.** `orderSignatureOf(row, params)` is the
canonical join of the wire values of the columns that tuple orders by (the auto
pk tiebreaker is excluded; every signature column must be projected, or module
eval throws). The runtime
compares it per refilled member row and re-derives the window via `windowIdsOf`
when it moved, so a `createdAt` resurface reorders the wire window instead of
leaving it stale. **Cost note:** each order-column update costs one O(window) ids
query (content-only updates stay on the zero-ids-query in-place path), so prefer
mostly-stable order columns for very hot rows. The mutable-`where` rule above does
NOT apply here: a where-flip is a detected membership exit/entry.

**Scroll segments (`scroll`).** A window spec may declare `scroll: { cutsOf,
keyField, maxKeyBytes }` (network/live passes it for a collection declared
`scroll: true`): each tuple may be one segment of a deep scroll — its order cut
by an exclusive `after` and an inclusive `until` row key — and every full and
scoped row carries its own row key in `keyField`. ONE key list per tuple order
(the declared keys, then the pk unless one already is) feeds the ORDER BY, the
cuts and the row keys, so the three cannot disagree. The row key is the
canonical JSON of each key's `col::text` (projected under `__row_key_<i>` and
folded in JS, `null` over `maxKeyBytes`); cuts render on the order side
(`primitives/keyset`'s `seekPredicate` for `after`, `atOrBeforePredicate` for
`until`, each operand cast `$n::<the key column's type>`), ANDed after the
tuple's `where` has been checked against its `whereReads` universe — so a
sortable-but-not-filterable order column takes cuts. Cuts read only order
columns, which the routes and the signature already cover: routes, `usesOf` and
roles are unchanged. More spec seams serve it: `window.limitOf` (decode the
tuple's limit when the descriptor's codec needs more than the params — a
contributed collection decodes against the column sets it serves),
`window.validateParams` (the params gate for the same reason — it replaces the
descriptor's on the server, through the runtime's
`ServerResourceOptions.validateParams`) and `readField` (where an `encodeRow`
moved a projected field — the order signature reads it there).

**Deferred compile (`deferredWindowQueryResource`).** The same compile, run at
`bindDeferredResources` (server-core's boot step after contributions are
collected): the resource registers now under its descriptor and `specOf()`
compiles at the bind, through the same checks. For a spec that depends on
contributions (network/live's `contributed` collections).

Structural differences from `queryResource`: no `limit` / `recompute` /
`scopedMembership` fields exist on the spec (the bound comes from the params;
membership is always incremental); bounded resources are never L2-persisted
(runtime-enforced), so a preloaded window loads via boot-snapshot's
fallback loader at the descriptor's `defaultParams` — the identical tuple a
bare `useLive(c)` subscribes to. `defaultLimit` lives ONLY on the descriptor
(the client default and the boot default must be one number); the spec carries
at most `maxLimit`. Every misuse (window+point, missing `orderBy`,
`defaultLimit > maxLimit`, spec/descriptor `maxLimit` disagreement, a function
`orderBy` without `signatureColumns`, an unprojected signature column, kind/descriptor drift, `point.by` ≠ identity pk,
`queryPk` ≠ derived keyField) throws at module eval — a bad spec is a boot crash,
never a silent misbehavior.

## Ordering-staleness caveat

A scoped keyed delta omits `order` (in-place row upserts only, never
membership/order), so a scoped update that moves a row's sort position leaves it
**in place** until the next FULL recompute reships `order` — an accepted trade-off:
a status/title flip ships one row, not the whole ordered list.

## `rel()` cascade edges (load-bearing)

`rel(upstream, hops, { signature? })` declares a cross-resource cascade: when
`upstream` notifies, the compiled edge's `affectedMap` chains `hops` to translate
changed upstream ids → this resource's changed ids. **Load-bearing:** the
tasks/attempts/agents cascade (the last hand-written `affectedMap` scoping in the
codebase) now rides these derived edges.

A **hop** (`{ via, from, to }`) is one join step — read `to` (distinct) from `via`
for every row whose `from` column is in the incoming id set. A single hop is a
plain FK translation (`rel(conversationsActive, { via: _conversations, from:
_conversations.id, to: _conversations.attemptId })` ⇒ `affectedMap = ids =>
selectDistinct({ v: attemptId }).from(_conversations).where(id IN ids)`); a hop
array chains one `selectDistinct` per hop, each hop's distinct `to` feeding the
next hop's `from IN (…)` (the agent-launches edge is two hops, `conv id → task id
→ launch id`). Ids are `String()`-coerced and **deduped between hops**; an **empty
hop short-circuits** the whole chain to `[]` with no further query — sound because
the runtime never calls `affectedMap` with an empty set, so an empty result can
only mean "no downstream rows".

Two ways to consume edges:

- **`queryResource({ …, edges: [rel(…)] })`** — folded into
  `serverOpts.dependsOn` for a fully-declarative resource (`tasksResource`).
- **`compileEdges([rel(…)], db?)`** — edges for a **hand-written**
  `defineResource` that keeps a bespoke loader but wants derived scoping
  (`attemptsResource`, `agentLaunchesResource`).

`opts.signature` is passed through verbatim to the `DependsOnEntry` — the
relevance gate that drops a cascade whose downstream-relevant upstream projection
is unchanged (e.g. a conversation's transient `waitingFor`/`updatedAt`, which the
tasks/attempts aggregates never read).

## The `db` seam

`spec.db` defaults to the real per-worktree drizzle `db` (a top-level static
import — the boundary system forbids inline `import()`), coerced once through a
minimal structural `QueryDb` facade; unit tests inject a fake. This works because
`@plugins/database/server` is **import-safe**: the pg pool (and its runtime-namespace
requirement) is built lazily on the first real query, so
importing `db` never touches a worktree — no test env shim needed.

## Boundaries

- `core/` — `queryResourceDescriptor` + the contract types (`QueryResourceContract`,
  `WindowQueryResourceContract`, `PointQueryResourceContract`). Web-safe:
  **no drizzle** (bundled into the browser).
- `core/` also holds the join vocabulary's types (`JoinSpec`, `ColumnRef`,
  `JoinRefs`, `JoinRef`, `JoinColumns`) and `BASE_RELATION` — type-only drizzle
  imports.
- `server/` — `queryResource`, `windowQueryResource`, `compileGroupsQuery`,
  `compileJoins` / `joinRefs`, `compileQuery`, `compileEdges`, `rel`, and the
  spec types. Owns all drizzle usage and the `identityTable` / routes / keyField
  derivation. `server/testing` publishes `compileWindowQuery` (the bounded
  compiler without registering) and `recordingQueryDb` for `network/live`'s
  tests.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Declarative SQL query→resource compiler: one drizzle-based declaration derives the loader, scoped loader, scope policy (an identityTable, or for a bounded window / point set and a grouping the routes the change router serves it by), and client keyOf for live-state resources.
- Server:
  - Uses:
    - `database.db`
    - `database/sql-projection.decodedRow`
    - `database/sql-projection.nullable`
    - `database/sql-projection.SqlDecoderLike`
    - `primitives/keyset.atOrBeforePredicate`
    - `primitives/keyset.orderByClauses`
    - `primitives/keyset.seekPredicate`
    - `primitives/keyset.SortKey`
  - Exports (types):
    - `CompiledGroups`
    - `CompiledQuery`
    - `CompiledUnion`
    - `Edge`
    - `EntitySource`
    - `Hop`
    - `QueryDb`
    - `QueryResourceSpec`
    - `QuerySource`
    - `ReadColumn`
    - `RoutedSource`
    - `SelectMap`
    - `UnionArmSpec`
    - `UnionCollectionSpec`
    - `UnionColumn`
    - `UnionCuts`
    - `UnionGroupsQuery`
    - `UnionOrderKey`
    - `WindowOrderKey`
    - `WindowQueryResourceSpec`
  - Exports (values):
    - `compileEdges`
    - `compileGroupsQuery`
    - `compileJoins`
    - `compileQuery`
    - `compileUnionCollection`
    - `deferredWindowQueryResource`
    - `joinRefs`
    - `queryResource`
    - `rel`
    - `windowQueryResource`
- Core:
  - Uses:
    - `primitives/live-state.keyedResourceDescriptor`
    - `primitives/live-state.PointResourceDescriptor`
    - `primitives/live-state.ResourceDescriptor`
    - `primitives/live-state.ResourcePreload`
    - `primitives/live-state.WindowParams`
    - `primitives/live-state.WindowResourceDescriptor`
    - `primitives/live-state.WindowSelector`
  - Exports (types):
    - `ArmKeyCodec`
    - `ColumnRef`
    - `ColumnRefsOf`
    - `ExprField`
    - `ExtensionJoin`
    - `JoinColumns`
    - `JoinFamily`
    - `JoinRef`
    - `JoinRefs`
    - `JoinSpec`
    - `JoinWireColumns`
    - `KeyedSideJoin`
    - `LookupJoin`
    - `PointQueryResourceContract`
    - `QueryResourceContract`
    - `TypedColumnRef`
    - `WindowQueryResourceContract`
  - Exports (values):
    - `armKeyCodec`
    - `BASE_RELATION`
    - `expr`
    - `familyMember`
    - `familyMemberAlias`
    - `isExprField`
    - `KIND_RE`
    - `queryResourceDescriptor`
- Cross-plugin:
  - Imported by:
    - `conversations/agents`
    - `network/live`
    - `runs`
    - `tasks/task-category`
    - `tasks/tasks-core`
- Exemptions:
  - Exempts itself from:
    - `resource-runtime:compiled-routes` — `server/internal/routes.ts` (sanctioned)
    - `live/no-legacy-resource-spelling` — `.` (sanctioned)
- Test helpers:
  - Server: `@plugins/infra/plugins/query-resource/server/testing`
    - `compileWindowQuery` — Turn a bounded spec + its shared contract into the two-arg `defineResource` server half.
    - `recordingQueryDb` — A `QueryDb` that renders every query through drizzle's real `PgDialect` — the SQL a compiler would send — records it, and answers with `script`'s rows instead of running it.
    - Types: `RecordedQuery`

<!-- AUTOGENERATED:END -->
