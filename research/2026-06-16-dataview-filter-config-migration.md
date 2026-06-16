# DataView view-state → config_v2 migration

**Date:** 2026-06-16
**Goal:** Move DataView per-view durable state (filter tree, sort, active-view)
out of `localStorage` (v0 stopgap) into `config_v2`, so it is server-side
durable, portable across browsers/devices on the same machine, and shareable.

## Scope split (what moves vs. stays)

The current `ViewState = { sort, query, filter, expanded }` is split by
durability semantics:

- **Durable → config_v2:** `activeViewId`, and per-view `{ sort, filter }`.
  These are the "what am I looking at" intent the task names. Server-side,
  portable.
- **Device-local → stays in `localStorage`:** per-view `{ query, expanded }`.
  `query` is transient search (persisting it server-side and replaying a stale
  search across reloads is bad UX); `expanded` is per-device tree-navigation UI
  state. Both remain in the existing `localStorage` path.

`useViewState`'s public handle (`ViewStateHandle`) is unchanged — `stateFor`
still returns a full `ViewState` by merging the config-backed `{sort, filter,
activeView}` with the local `{query, expanded}`. `data-view.tsx` and the view
children need **zero** changes.

## Storage model

A new general config field type **`jsonField`** (under
`plugins/fields/plugins/json/`) holds an arbitrary Zod-validated JSON value.
This fills a real gap: there is no `json`/`record`/`map` field type today, and
the recursive `FilterGroup` tree cannot be expressed by `objectField`
(fixed-key) or `listField`. `jsonField({ schema, default })` requires a Zod
schema — it is *typed dynamic-keyed JSON*, not an untyped blob, preserving the
typed-config philosophy. Its settings renderer is read-only (formatted JSON +
the standard reset affordance); this state is written by the app, not hand-edited.

The data-view primitive owns **one** descriptor:

```
defineConfig({
  name: "view-state",
  fields: {
    surfaces: jsonField({
      schema: z.record(z.string(), surfaceStateSchema),   // keyed by storageKey
      default: {},
    }),
  },
})
```

`surfaceStateSchema = { activeView: string | null, views: Record<viewId,
{ sort: SortState | null, filter: FilterGroup | null }> }`. `storageKey` (already
the `<DataView>` seam, all 8 call sites are static literals) becomes the map key.

Reads: `useConfig(descriptor).surfaces[storageKey]`. Writes: debounced
`setConfig("surfaces", { ...surfaces, [storageKey]: next })`.

## Why single-descriptor (not per-storageKey)

- A `FilterGroup` is recursive → needs the `jsonField` regardless of layout, so
  per-key descriptors gain nothing on the storage primitive.
- Keeps the data-view primitive **consumer-agnostic**: consumers keep passing a
  plain `storageKey` string and never import `config_v2`. The clean boundary is
  preserved and there are zero consumer edits.
- Mirrors how `reorder` registers config under config_v2, but with one owner.

**Tradeoff (documented):** all surfaces share one field, so two DataViews
writing within the same sub-debounce window could last-write-wins-clobber each
other's *most recent* view-state change. This affects only ephemeral view state
(not user content), self-heals on the next interaction, and is improbable (a
user drives one list at a time). Accepted over the churn + recursive-filter
storage problem of per-key descriptors.

## Write latency

`useConfig` is reactive over live-state (≈100–200ms after a write lands).
`useViewState` keeps a thin **optimistic local mirror** so sort/filter toggles
feel instant, reconciling from `useConfig` when external truth catches up.
Writes are **debounced** (~400ms trailing, flushed on unmount) because
`setConfig` fires one full-document POST per call.

## One-time migration

On mount, if `surfaces[storageKey]` is absent and the legacy
`${storageKey}:view-state` localStorage blob carries a non-default sort/filter or
a persisted active-view, seed config once (best-effort). Prevents users losing
current filters. `query`/`expanded` continue to read from localStorage.

## Files

- **New** `plugins/fields/plugins/json/` — `core` (`defineFieldType` +
  `defineFieldIdentity`), `web` (`Fields.Identity`), `plugins/config/core`
  (`jsonField` factory), `plugins/config/web` (read-only renderer).
- **New** `plugins/primitives/plugins/data-view/server/index.ts` —
  `ConfigV2.Register({ descriptor })`.
- **New** `plugins/primitives/plugins/data-view/shared/view-state-config.ts` —
  the descriptor + Zod schemas (`filterGroupSchema`, `surfaceStateSchema`),
  imported by both web and server barrels (plugin-private `shared/`).
- **Edit** `data-view/web/index.ts` — add `ConfigV2.WebRegister` contribution.
- **Rewrite** `data-view/web/internal/use-view-state.ts` — config-backed
  durable state + local-backed `query`/`expanded` + optimistic mirror + debounce
  + migration. Public `ViewStateHandle` unchanged.
- Generated/committed `config/.../view-state.origin.jsonc` (from `build`).
