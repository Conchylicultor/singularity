# live-state

## No Suspense — hydrate, don't suspend

Resource reads are **non-suspending** by design. `useResource` returns a
`pending` flag; it never throws a promise. There is no `<Suspense>` boundary
anywhere in the app (the old app-level fallback and the `suspense-boundary`
slot middleware were removed). To avoid a first-paint flash of default values,
seed the cache **before render** with `hydrateResource(resource, params, value)`
(see config_v2's `Core.Boot` task for the canonical use) rather than suspending.

If you ever add a genuinely suspending read (`React.lazy`, `useSuspenseQuery`),
it has **no ambient boundary** — you must wrap it in your own `<Suspense>`.

## Resource schemas

Every resource **must** declare a `schema` (Zod) — it is required on
`defineResource` (both runtimes) and guarded at registration. The payload is
parsed against that schema **twice**, by design:

- **On the server, at load time** — the single chokepoint (`timedLoad` in the
  shared `@plugins/framework/plugins/resource-runtime/core`, which now backs both
  the server and central channels) parses the loader output before any broadcast
  or HTTP response. A payload that violates its schema throws
  there and is handled by the existing loader-failure path (reported + the send
  skipped / a `sub-error` returned) rather than shipping a malformed value. This
  is the single structural guarantee that every live-state payload matches its
  declared schema. Keyed Layer-2 scoped loads return a partial array, which
  still satisfies the `z.array(Element)` schema.
- **On the client, on receipt** — before the value lands in the TanStack cache,
  at both write paths: `useResource`'s `queryFn` HTTP fallback
  (`web/use-resource.ts`) and the WS push path in
  `NotificationsClient.applyUpdate` (a key→schema registry populated as
  `useResource` calls `observe`).

This makes the TS type and the runtime shape impossible to drift: types like
`Date` that don't survive `JSON.parse` are coerced (`z.coerce.date()`) on the
way in, so consumers can rely on them. See
`research/2026-06-08-global-mandatory-resource-schema-server-validation.md`
(and the earlier `research/2026-04-29-global-resource-schema-validation.md` for
the original client-side migration).

## Keyed delta sync (`mode: "keyed"`)

Array resources that rebroadcast the whole list on every change can opt into
row-level delta sync. The resource still runs its full loader, but the server
keeps a per-`(key,params)` snapshot of id→hash, diffs the new result by row id,
and broadcasts only `upserts`/`deletes` — not the whole array. The client merges
by id and keeps unchanged rows' object references, so memoized row components
don't re-render.

The delta carries the full id `order` **only when membership/order actually
changed** (an add, delete, or reorder). For the common in-place-update case (a
status/title flip on one row) `order` is omitted entirely, so the frame is just
the one changed row — the id list (which dominates the frame for large lists) is
never sent. When `order` is absent the client maps over its prior array in
place, swapping changed rows by id; when present it rebuilds from the
authoritative `order`. An omitted `order` strictly means "in-place upserts,
membership unchanged" (`deletes` is then necessarily empty, and there are no new
ids).

Opting in is a ~two-line change on each side:

- **Server** (`defineResource`): `mode: "keyed"` + `keyOf: (row) => row.id`.
  The payload must be an array; `keyOf` is required for keyed mode (guarded at
  registration). The first notify per pk (and every `sub-ack` / HTTP fallback)
  still ships a full `{ value, version }` so brand-new clients get a complete
  base; subsequent notifies ship a `delta`.
- **Client**: use `keyedResourceDescriptor(key, schema, initialData, keyOf)`
  instead of `resourceDescriptor`. `schema` stays `z.array(Element)`, so `T`
  (and every `useResource` caller) is unchanged — callers still get `T[]`. The
  client `keyOf` keys prior cache rows when merging a delta; per-row parsing
  goes through the array schema's `.element`. A delta that arrives with no
  cached base is dropped and a fresh full sub is forced (load-bearing guard).

Strictly additive: `push`/`invalidate` resources are untouched. `tasks` and
`attempts` are the first adopters.

### Scoped recompute (`notify(params, { affectedIds })`)

Layer 1 shrinks the wire payload but the keyed loader still recomputes the
**whole** view on every fire. Layer 2 lets a high-frequency content-only caller
scope the recompute: `notify(params, { affectedIds: [...] })` tells the loader,
via `ctx.affectedIds`, which row ids changed, so it can `WHERE id IN (…)` and
return only those rows. The scoped diff merges the partial result into the
existing snapshot and ships a `{ kind: "delta", upserts, deletes: [], order:
undefined }` — exactly Layer 1's content-delta shape, so the client needs zero
changes. An empty scoped set skips the send entirely.

This is **opt-in and strictly additive**: plain `notify()` / `notify(params)`
keeps today's full-recompute semantics, which remain authoritative for any
membership change (create/delete/reorder must stay FULL — a scoped delta never
asserts `order`/`deletes`). It is also **sticky-FULL**: within one flush, if any
contributor to a pk is id-less (or a cascade edge can't map ids), the pk
degrades to a FULL recompute — scoping never silently drops a change, and the
next FULL notify or a resub self-heals any drift. Cascades propagate scope via
an `affectedMap?(upstreamAffected, upstreamParams) => string[]` on each
`dependsOn` edge (upstream-FULL, missing map, or a throwing map ⇒ downstream
FULL). `affectedMap` must self-query the DB rather than read the upstream value,
so it does not force the upstream loader to run. The conversation poller and
`insertPush` are the first adopters.

### Future escape hatch (NOT yet implemented)

Some hot-path resources may eventually be large enough that Zod-parsing every
push hurts. The planned escape hatch is a `transform: (raw) => T` field on the
descriptor that bypasses Zod for those cases. Don't add it speculatively —
current payloads are small and parse cost is negligible.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Server live-state primitive: useResource hook + NotificationsProvider + NotificationsClient. Thin TanStack Query wrapper over the app's leader-elected /ws/notifications channel.
- Load-bearing: yes
- Core:
  - Exports: Types: `ResourceDescriptor`, `ResourceOrigin`; Values: `centralResourceDescriptor`, `keyedResourceDescriptor`, `resourceDescriptor`, `tolerantEnum`
- Web:
  - Exports: Types: `ChannelStatuses`, `ResourceDescriptor`, `ResourceKey`, `ResourceOrigin`, `ResourceResult`; Values: `centralResourceDescriptor`, `hydrateResource`, `keyedResourceDescriptor`, `NotificationsClient`, `NotificationsProvider`, `queryKeyFor`, `resourceDescriptor`, `useNotificationsChannelStatuses`, `useNotificationsStatus`, `useResource`

<!-- AUTOGENERATED:END -->
