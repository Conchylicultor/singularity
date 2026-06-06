# Unified `fields/` primitive — a type × capability matrix

## Context

Field-type knowledge is fragmented across two unrelated systems that share vocabulary
(`text`/`number`/`enum`, `FieldDef`, `FieldType`, `options`) but model different things and
cannot reuse each other's renderers:

- **config_v2 fields** (`plugins/config_v2/plugins/fields/plugins/{primitives,enum,avatar,color,secret,list,object,…}`)
  — a mature, **load-bearing** *editable scalar* system. Each type sub-plugin defines a frozen
  `FieldType<T>` token and contributes a renderer to the `Fields.Renderer` dispatch slot
  (`config-v2.fields.renderer`), keyed by `field.type.id`, that edits **one** value of type `T`
  (`{ field, value, onChange }`). Backed by JSONC storage + hash-based conflict detection.

- **data-view fields** (`plugins/primitives/plugins/data-view`) — a *column projection over rows*.
  `FieldDef<TRow>` carries `value(row)`, `cell(row)`, `sortable`, `width`, `options`, `cover`, and a
  closed `type` string union. Cell rendering is **hand-written per consumer** via `cell`; there is no
  per-type dispatch. Per-field filtering is a wired-but-unapplied **no-op hook point**
  (`ViewState.filters`, `setFilter`) — Phase 3.

The two "field" systems collide because **each capability edits a different value**: a config enum
edits one `string`; a filter enum edits `string[]`; a number filter edits `{min,max}`. They share
**type identity**, not renderers.

**Goal:** a single `fields/` primitive organized as a two-dimensional matrix, mirroring the
established **facets** sub-plugin pattern (`plugin-meta/plugins/facets/plugins/{type}/plugins/{render-diff,render-detail,render-catalog}`,
where each type sub-plugin contributes to capability slots **owned by different consuming surfaces**,
keyed by id). One axis is the field **TYPE** (text, number, enum, image, avatar, secret, …); the
other is the **CAPABILITY** (config read-write, table cell, filter). The matrix is legitimately
sparse; slots fall back on missing contributions.

This is on the critical path to the "Notion-like WeChat where agents compose apps from plugins"
vision — a field schema with type-driven config/cell/filter behavior is the building block agents use
to assemble data surfaces.

### Decisions locked in (from the user)

1. **Placement: top-level `plugins/fields/`** (not under `plugins/primitives/`). `fields/core` is a
   pure primitive token, but the umbrella legitimately couples *up* to feature plugins via its leaf
   capability contributors — so it is not a "pure primitive" and earns a top-level home, like facets.
2. **Fine-grained type ids, with shared logic in generic base plugins.** `int`/`float` keep distinct
   ids (distinct config editors) but **derive** their table/filter behavior from a generic `number`
   base plugin; `multiline-text` derives from a `text` base; etc. Sharing is by **derivation**, not a
   flat `kind` enum.
3. **Gradual migration with a temporary re-export exception.** `config_v2/core` may temporarily
   re-export the relocated token (a sanctioned, documented exception to the no-cross-plugin-re-export
   rule) so importers move incrementally; the shim is removed once all importers point at `fields/core`.

---

## Architecture

### The matrix

```
plugins/fields/                                  TOP-LEVEL umbrella
  core/                  FieldType<T> token + FieldIdentity (label, icon, coerce, extends)
  plugins/
    text/                generic base — owns shared text cell/filter/comparison
      core/              textFieldType identity
      plugins/{config, table, filter}/
    multiline-text/      extends: text  → inherits table+filter, custom config editor
      plugins/{config}/
    number/              generic base — owns shared numeric cell/filter/comparison
      core/              numberFieldType identity
      plugins/{config, table, filter}/
    int/                 extends: number → inherits table+filter, custom config editor (int stepper)
      plugins/{config}/
    float/               extends: number → inherits table+filter, custom config editor (float stepper)
      plugins/{config}/
    bool/                plugins/{config, table, filter}/
    enum/                plugins/{config, table, filter}/   (filter value = string[])
    date/                plugins/{table, filter}/           (no config — data-view-only)
    color/               plugins/{config, table}/           (sparse: no filter)
    avatar/              plugins/{config, table}/           (sparse: no filter)
    image/               plugins/{table}/                   (data-view media; sparse)
    secret/              plugins/{config}/{core,web,server,central}  (NO table/filter — security)
    object/  plugins/{config}/   (recursive, config-only)
    list/    plugins/{config}/   (recursive, config-only)
```

- **TYPE dimension** = one sub-plugin per field kind under `plugins/fields/plugins/`.
- **CAPABILITY dimension** = `plugins/{config,table,filter}` sub-plugins under each type, each
  contributing to a capability slot **owned by its consuming surface** (never owned by `fields/`).
- The matrix is **sparse**: a type contributes only the capabilities it supports. Absence is handled
  by per-slot fallback (config → `Placeholder`; table → `String(value)`; filter → field not
  filterable). This is the facets `return null` model.

### Capability slots stay with their consumers (the facets rule)

Exactly as facets' render-* sub-plugins point at slots owned by plugin-view / plugin-changes /
forge-catalog, `fields/` type sub-plugins point *up* at slots owned by the consuming surfaces. **`fields/`
never owns a capability slot.**

| Capability   | Slot owner                              | Slot id (immutable)          | Value model edited            |
|--------------|-----------------------------------------|------------------------------|-------------------------------|
| config render| `config_v2/plugins/fields` (**exists**) | `config-v2.fields.renderer`  | `T` (per-type scalar)         |
| table cell   | `data-view` (**new**)                   | `data-view.cell`             | read-only `FieldValue`        |
| filter       | `data-view` (**new**)                   | `data-view.filter`           | per-type (`string[]`, `{min,max}`, …) |

The config-render slot is unchanged (see `config_v2/plugins/fields/web/internal/slots.tsx`). The two
new slots are added to **data-view**, which already owns the table view and the Phase-3 filter
hook point.

### The canonical token + identity (`fields/core`)

`fields/core` is the only primitive — it depends on **nothing** and is browser-safe (no fs), mirroring
`facets/core`. It hosts the token (byte-identical to config_v2's existing one) plus a richer
**identity** that adds derivation and value-coercion:

```ts
// plugins/fields/core/internal/types.ts
export interface FieldType<T = unknown> {
  readonly id: string;     // fine-grained dispatch key: "int","float","enum","color",…
  readonly _T?: T;         // phantom type for inference
}
export function defineFieldType<T>(id: string): FieldType<T> {
  return Object.freeze({ id });
}

export interface FieldIdentity<T = unknown> {
  readonly type: FieldType<T>;
  readonly label?: string;
  readonly icon?: ComponentType<{ className?: string }>;
  /** Base type whose table/filter contributions this type inherits (derivation). */
  readonly extends?: FieldType;
  /** Projection to a sortable/comparable scalar (Date→ms, bool→0/1, …). */
  readonly coerce?: (value: T) => string | number | null;
}
export function defineFieldIdentity<T>(identity: FieldIdentity<T>): FieldIdentity<T> { … }
```

- The `id` stays the **fine-grained** dispatch key; config & table dispatch on it exactly.
- `extends` enables **derivation**: `int`/`float` declare `extends: numberFieldType`; the table/filter
  dispatch walks the `extends` chain on a miss, so derived types inherit the base's renderer with
  zero duplicate contributions. (config dispatch stays exact — each concrete type has its own editor.)
- `coerce` lives on identity so both sort (data-view) and any comparison consumer share one projection.

### Generic base plugins (derivation)

Rather than a flat `kind` enum, **shared logic lives in a generic base type plugin** and concrete types
derive from it:

- `fields/plugins/number/` is the generic numeric type. Its `plugins/table` and `plugins/filter`
  contribute a `NumberCell` and a `NumberFilter` control + numeric `predicate`, keyed `"number"`.
- `fields/plugins/int/` and `fields/plugins/float/` declare `extends: numberFieldType` in their
  identity and ship **only** a `config` sub-plugin (the distinct stepper editor). They contribute
  **no** table/filter — the `data-view.cell` / `data-view.filter` dispatch resolves `"int"` → miss →
  walk `extends` → `"number"` → hit. Same for `text` ← `multiline-text`.

This keeps the matrix small, makes "a numeric field is filterable as a range" a single
implementation, and matches the "split for modularity / derive shared behavior" principle.

### Capability slot contracts

**1. config render (exists, unchanged).** `Fields.Renderer` dispatch slot in
`config_v2/plugins/fields/web/internal/slots.tsx`, keyed `props.field.type.id`, fallback
`<Placeholder>Unknown field type</Placeholder>`. Contribution = a `FieldRendererComponent<T>` with
static `.type`. **Frozen, not modified by this work** — only the *location* of contributors moves
(see migration).

**2. table cell (new, owned by data-view).** A dispatch slot that renders a **read-only** cell from a
projected value. The renderer receives the *projected scalar* as the canonical input; the row is an
escape hatch, documented as non-canonical to avoid re-leaking row coupling:

```ts
// plugins/primitives/plugins/data-view/web/cell-slot.ts   (NEW)
export interface TableCellProps {
  value: FieldValue;             // = projection.value(row), already projected
  field: FieldProjection<unknown>; // for options/align context (e.g. enum chip)
  raw?: unknown;                 // the row — escape hatch only, not the canonical path
}
// defineDispatchSlot keyed by field type id, with extends-chain fallback,
// final fallback → String(value ?? "")  (today's behavior in table-view.tsx)
```

Dispatch precedence in `table-view.tsx` becomes **3 tiers** (strictly additive — existing consumers
unaffected): ① consumer `projection.cell` (override) → ② type cell renderer via `data-view.cell` →
③ `String(value ?? "")`.

**3. filter (new, owned by data-view).** A dispatch slot providing a control (edits the per-type
filter value) **and** a pure predicate + active-guard so the row pipeline can apply it outside React:

```ts
// plugins/primitives/plugins/data-view/web/filter-slot.ts   (NEW)
export interface FilterContribution {
  match: string;                                              // field type id
  Control: ComponentType<FilterControlProps>;                 // edits ViewState.filters[fieldId]
  predicate: (filterValue: unknown, fieldValue: FieldValue) => boolean;
  isActive: (filterValue: unknown) => boolean;                // empty filter ⇒ inactive, skip
}
```

- Filter value lives in the **existing** `ViewState.filters[fieldId]` (`Record<string, unknown>`),
  written by the **existing** `setFilter` — no contract change to ViewState.
- The host resolves `bySlot.get("data-view.filter")` into a `Map<typeId, FilterContribution>` at the
  component level (the pattern `useConfigRegistrations` already uses), threads it into
  `useDataViewRows`, which loops active filters and applies `predicate` **at the marked no-op hook
  point** (`use-data-view-rows.ts:42`) before sort. Resolution honors the `extends` chain.
- A type with no filter contribution (and no filterable base) ⇒ not in the map ⇒ no control rendered,
  skipped by the predicate loop. Sparse, no special-case.

### data-view's `FieldDef` — keep layered, rename to kill the collision

data-view's `FieldDef<TRow>` is a **row projection** (`value(row)`, `cell(row)`, `width`, `sortable`)
— inherently consumer/row-specific and **cannot** fold into the row-agnostic token. It stays a
distinct data-view-layer descriptor *referencing* the shared token by id:

- **Rename** `data-view` `FieldDef<TRow>` → **`FieldProjection<TRow>`** (only 1 consumer — Sonata —
  plus the view children; cheap). Keep config_v2's `FieldDef<T>` name as-is (40+ importers; do not
  rename). This kills the `FieldType`/`FieldDef` name collision at the low-churn end.
- **`FieldProjection.type`** changes from a closed string union to a registered type **id** (`string`),
  opening the taxonomy to the `fields/` registry. `value`/`cell` remain the projection/override layer.
- data-view's old `FieldType` string union is **deleted**; the shared `FieldType` token comes from
  `fields/core`.

### Dependency graph (DAG — validated, no cycle)

```
fields/core ───────────────────────────────────────────────┐ (pure sink, browser-safe)
   ▲                ▲                          ▲             │
   │(temp re-export)│                          │             │
config_v2/core   config_v2/plugins/fields/web  data-view/{core,web}
   ▲                ▲                          ▲        ▲
   │                │                          │        │
fields/<t>/config/core   fields/<t>/config/web   fields/<t>/table/web   fields/<t>/filter/web
(factory; +importers)    (→ config-v2 slot)      (→ data-view.cell)     (→ data-view.filter)
```

- `fields/core` and `data-view/core` are sinks. Every `fields/plugins/*` leaf points *up* at a
  consumer surface that itself points *down* at `fields/core`. Slot owners never import any
  `fields/plugins/*` sub-plugin. No cycle.
- Type-only imports count as edges; the graph above already accounts for them.
- Boundary note: components read facet/field data by **string-literal id** (not by importing the
  token barrel) where needed to keep the bundle clean — the established facets practice.

---

## Migration (gradual, behavior-preserving)

Sequenced so each stage ships independently and nothing load-bearing breaks. The **in-flight
data-view Phase-3 filtering** work is Stage 0 and must commit to the slot contract now.

**S0 — Phase-3 filtering ships the *slot*, not an inline switch (coordinate the in-flight deliverable).**
Define `data-view.filter` (the `FilterContribution` shape above) and `data-view.cell`
(`TableCellProps`) **now**, owned by data-view. Wire `useDataViewRows` to resolve a
`Map<typeId, FilterContribution>` and apply predicates at the existing no-op point. Initial
contributors may live *temporarily inside data-view*, but they **must be slot contributions**. **Locked
contract (cannot change later):** `ViewState.filters[fieldId]: unknown`, the `setFilter` signature, and
the `FilterContribution` / `TableCellProps` shapes. If Phase-3 ships a hardcoded `switch(field.type)`,
the eventual move into `fields/` becomes a rewrite — this is the #1 risk.

**S1 — Create `fields/core`.** Token (identical shape) + `FieldIdentity` (`extends`, `coerce`).
`config_v2/core` **temporarily re-exports** `defineFieldType`/`FieldType` (sanctioned exception; see
Risks). Zero dispatch change, fully behavior-preserving.

**S2 — Add generic base plugins + new capabilities.** Stand up `fields/plugins/{text,number,enum,bool,date,…}`
with their `table`/`filter` capability sub-plugins, contributing to the data-view slots from S0. Migrate
the temporary S0 contributors out of data-view into `fields/`. data-view `FieldProjection.type` becomes a
registered id; `int`/`float`/`multiline-text` inherit via `extends`. Sonata and forge consumers can drop
hand-written `cell`s where a type renderer suffices (override path keeps working regardless).

**S3 — Relocate config field plugins gradually.** Move config_v2's ~12 type plugins into
`fields/plugins/{type}/plugins/config` **one at a time**, updating importers of each factory
(`textField`, `boolField`, …) incrementally. The temporary token re-export covers the gap. Per move,
keep **byte-identical**: slot id `config-v2.fields.renderer`, dispatch key `field.type.id`,
`ConfigV2.WebRegister`/`ConfigV2.Register` slot ids, every live-state resource id, and every
`FieldStorageProvider` key. `secret` moves as a 4-runtime unit (`core/web/server/central`); inventory
`readSecretConfig`'s central importers (auth providers) since its import path changes. `object`/`list`
recursion is preserved as long as the slot id string never changes.

**S4 — Remove the temporary re-export.** Once all importers point at `fields/core` directly, delete the
`config_v2/core` shim and re-enable the strict boundary check for it.

### Implementation task chain (linear — each picks up from the prior outcome)

1. **Implement the fields/ primitive foundation** — `fields/core` token+identity (`extends`/`coerce`) and
   the two new data-view capability slots (`data-view.cell`, `data-view.filter`) + dispatch wiring.
2. **Validate by migrating one field type end-to-end** — one representative type across config + table +
   filter (+ a derivation), wired through Sonata + a config descriptor. Confirm/revise the contracts here.
3. **Populate the remaining field types** — generic bases (text, number) + bool/enum/date/color/image and
   the `extends`-derived int/float/multiline-text.
4. **Unify the token** — `fields/core` owns it; `config_v2/core` re-exports temporarily (sanctioned
   exception) with a boundary-check accommodation.
5. **Migrate config field plugins — batch 1**: primitives (text/bool/int/float) + multiline-text.
6. **Migrate config field plugins — batch 2**: enum, dynamic-enum, color, avatar.
7. **Migrate config field plugins — batch 3**: list, object, secret (recursive + 4-runtime).
8. **Remove the temporary re-export** and re-enable strict boundaries.

Tasks 2–8 each depend on the one before; only task 1 is unblocked initially.

---

## Risks (ranked)

1. **Phase-3 ships filtering as an inline `switch(field.type)` instead of the `data-view.filter` slot.**
   Then S2/S4 are a rewrite, not a move. *Mitigation:* gate S0 on the slot + contribution shape existing,
   even with co-located contributors. This is the single non-negotiable coordination point.
2. **Config factory relocation churn (S3) is not "pure relocation."** ~40 `defineConfig` import sites +
   `readSecretConfig` central consumers change paths; the no-re-export rule forbids a *permanent* shim.
   *Mitigation:* the temporary re-export exception (user-approved) + gradual per-type moves + codemod;
   the `docs/plugins-details.md` reverse-index is the work list.
3. **The temporary re-export must be tolerated by `./singularity check --plugin-boundaries`.** It violates
   R-no-cross-plugin-re-export by design. *Mitigation:* a documented, scoped allowlist entry (or a known,
   tracked suppression) for the `config_v2/core → fields/core` token re-export only, removed in S4.
4. **`secret` as a readable table cell is a security hole, not just sparseness.** *Mitigation:* `secret`
   contributes no table/filter and declares no `extends`; document (and ideally check) that secret values
   never enter a `FieldProjection.value(row)` so the `String(value)` fallback is never reachable.
5. **Hidden dispatch-key strings (slot ids, resource ids, storage-provider keys) silently break on
   rename.** *Mitigation:* enumerate and freeze them as migration invariants — they are not refactorable
   identifiers.
6. **`extends`-chain resolution adds a dispatch step.** *Mitigation:* keep the chain shallow (one hop:
   int→number) and resolve into the same `Map` lookup; document that config dispatch stays exact-match.
7. **`media`/`avatar`/`image` over-merge.** They are different identities (config avatar = icon+color;
   data-view media = cover image). *Mitigation:* keep distinct ids with distinct capability coverage;
   gallery cover-pick stays a gallery concern.

---

## Critical files

- `plugins/config_v2/core/internal/types.ts` — token + `FieldDef` source; the temporary re-export origin.
- `plugins/config_v2/plugins/fields/web/internal/slots.tsx` — the **frozen** `config-v2.fields.renderer`
  dispatch contract.
- `plugins/primitives/plugins/data-view/core/internal/types.ts` — `FieldProjection` rename + `type`→id
  change + `ViewState.filters` (unchanged).
- `plugins/primitives/plugins/data-view/web/internal/use-data-view-rows.ts` — the no-op hook point where
  the filter predicate map wires in (line 42).
- `plugins/primitives/plugins/data-view/plugins/table/web/components/table-view.tsx` —
  `FieldProjection`→`ColumnDef` map; the `data-view.cell` dispatch insertion site.
- `plugins/plugin-meta/plugins/facets/plugins/routes/` — the **template** to mirror (type × capability,
  leaf-consumer dependency direction, browser-safe core).

## Verification (per stage)

- **S0:** `./singularity build`; open Sonata → Library → Table; a per-type filter control appears for a
  numeric/enum field, narrows rows live, persists per view. Confirm filtering goes through a *slot*
  contribution (grep that no `switch(field.type)` exists in `use-data-view-rows.ts`).
- **S1:** build + `query_db`-independent; `useConfig` still returns live values; settings pane renders
  all existing field types unchanged (token reference-equality intact).
- **S2:** a derived `int` field renders the shared number cell and the number range filter via `extends`
  with no `int`-specific table/filter contribution; Sonata gallery/table parity preserved.
- **S3 (per type):** edit a relocated field type in the settings pane → value persists to JSONC, conflict
  detection still fires on a stale `// @hash`; `secret` set/clear still works (storage provider key
  intact); `object`/`list` nested editing still dispatches.
- **All:** `./singularity check` passes (plugin boundaries — with the documented temporary exception in
  S1–S3, removed in S4 — migrations-in-sync, eslint, plugins-doc-in-sync).
