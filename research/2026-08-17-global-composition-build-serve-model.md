# Composition build & serve model — vision and phased plan

## Context

A composition is a named subset of plugins. Today they are second-class: the main
app is not one, the CLI has three overlapping ways to build one, serving a
composition requires a full main build, and a composition namespace can only
exist on main. The result is that "build sonata" is not a thing you can do — you
build main and sonata falls out of it.

This doc states the target model and the order of work to reach it. Each phase
below becomes its own task and writes its own plan; nothing here is a detailed
design.

Companion doc (the user-facing mental model this refines): the "Build, serving"
page, block `block-b4f38ca7-b710-4003-a206-cd9b8d25d091`.

---

## Target model

**1. A composition is the unit of building. The main app is one of them.**

`singularity` becomes an ordinary manifest entry whose closure is what
`web.generated.ts` covers today. There is no "main build" path — only
`build --composition <name>`, with `singularity` as the default when no flag is
given. Every property that holds for `sonata` holds for `singularity`.

**2. Namespace = `<composition>.<checkout>`.**

Flat directory names under `~/.singularity/worktrees/`, no nesting:

| composition | checkout | namespace | URL |
|---|---|---|---|
| singularity | main | `singularity` | `singularity.localhost:9000` |
| sonata | main | `sonata` | `sonata.localhost:9000` |
| singularity | att-XXX | `att-XXX` | `att-XXX.localhost:9000` |
| sonata | att-XXX | `sonata.att-XXX` | `sonata.att-XXX.localhost:9000` |

`singularity.` and the main checkout suffix are elided, which preserves every
URL in use today. The residual ambiguity — is `foo` the composition `foo` on
main, or `singularity` on checkout `foo`? — is resolved by one rule: **a known
composition id wins, and a checkout may not take a composition's name.** That
collision guard already exists in spirit (compose-serve refuses to write into a
spec dir lacking a `composition.json` marker); it needs generalizing, not
inventing.

**3. One CLI verb.**

```
build                                  # = build --composition singularity
build --composition sonata             # deploy sonata into the dev cluster
build --composition sonata website      # union build; artifacts shared via the store
build --composition sonata --hermetic   # portable artifact set, no cluster contact
```

`--hermetic` is a posture, not a single effect. It selects the release dist
target, materializes real bytes instead of symlinks, writes no `spec.json`,
skips every cluster interaction (Postgres, DB fork, gateway, run ledger), and
runs the fast validation set rather than the full checks pass.

Removed: `build-composition`, `build --serve-composition`, and any standalone
`--materialize`.

**4. Vendor sets are per-composition, shared by content address.**

No global superset. Each composition resolves its own vendor set; two
compositions with identical dependencies share the bundle automatically because
sets are keyed by `setHash` under `~/.singularity/web-artifacts/vendors`.

**5. Deactivating a composition stops auto-building it. Nothing is swept.**

The existing dist, spec and database stay live until explicitly removed. There
is no deactivation sweep.

---

## Where we already are

The artifact engine already matches the target model. What is missing is the
identity model and the CLI surface.

Already true:

- Per-plugin, content-addressed, cached artifact builds, shared across worktrees
  (`web-artifacts/core/internal/store.ts`, `pipeline.ts`). Building N
  compositions builds the union once.
- Composition-only builds that need no main build — `build-composition` plans
  from `compositionFleetSource()` and resolves its own vendor set, by design, so
  it runs on a bare host from a fresh clone.
- Hermetic output (`materialize: true`), and its dist path
  `worktrees/<checkout>/release-web/<composition>`.
- `worktrees/singularity/web`, `worktrees/sonata/web`, `worktrees/<worktree>/web`.

Not true yet:

- `singularity` is not a composition; main builds from the committed full registry.
- The gateway rejects multi-label namespaces (`parseWorktree` returns `""` when
  the name contains a `.`), so `sonata.att-XXX` cannot be served.
- Serving a composition requires a full main build, because compose-serve reuses
  main's vendor set via `readFleetVendorMeta`, which throws unless the whole
  fleet is in the store.
- Composition serving is main-only, gated in three places.
- Vendor **resolution** is uncached and sequential, costing 35–110 s on builds
  where nothing is stale.

---

## Phases

Ordered by dependency. Phases 0 and A are independent of everything else and pay
off immediately.

### Phase 0 — Cache and parallelize vendor resolution

**Problem.** `ensureVendorSet` calls `resolveVendorSet` *before* it checks the
store, and `resolveVendors` loops sequentially, running a full `esbuild.build()`
probe per specifier plus package.json walks and lexer passes. Measured on main
with `artifacts:build (0 stale)`: `artifacts:vendors` = 35.7 s / 110.5 s /
56.4 s / 37.5 s. It is the dominant cost of every warm build.

**Shape.** Resolution maps `{specifier, resolveDir}` →
`{entryFile, version, cjs, wrapper}`; that output is also the input to the set
hash, which is why it cannot be skipped. Cache it keyed on
`(bun.lock hash, esbuild.version, builder source digest)`, entry-keyed by
`"<resolveDir>\0<specifier>"`, stored beside the existing
`~/.singularity/web-artifacts/fingerprints/` (reuse the
`loadFingerprintCache`/`saveFingerprintCache` idiom). Validate a hit with a
`statSync` on the cached `entryFile` so a `bun link` or hand-edited
`node_modules` cannot serve a stale result. Bound the loop with `Promise.all`
independently of the cache.

**Files.** `web-artifacts/core/internal/vendors.ts`.

**Done when.** A warm build's `artifacts:vendors` span is small, and a cold one
is unchanged in correctness.

### Phase A — Link composition runs in the build UI

**Problem.** Clicking "Serve sonata" opens a run labelled `main`, with no path
to the sonata child run. The data exists — `build_runs.target` and
`build_runs.parentId` — but only `build-commits` reads parentage.

**Shape.** Point the toast and build button at the child run; render
parent↔children in the detail pane.

**Files.** `plugins/build/plugins/build-info/web/`, `plugins/build/web/components/`.

### Phase 1 — Per-composition vendor sets

Drop `vendors: await readFleetVendorMeta(...)` from the compose-serve path so a
composition resolves its own set, matching what `build-composition` already
does. This is the change that removes the main-first coupling.

Note the reason the shortcut existed: a served dist *symlinks* the vendor set
dir, so a superset costs nothing on disk, whereas a hermetic dist `cpSync`s it
whole and a superset would ship every vendor bundle in the repo. With Phase 0
landed, per-composition everywhere is both simpler and cheap.

**Files.** `cli/bin/commands/internal/compose-serve.ts`.

### Phase 2 — `singularity` becomes a composition

Add the manifest entry whose resolved closure equals today's full registry, and
make `build` with no flag mean `--composition singularity`. Removes the special
case at the root and unblocks Phases 3 and 7.

**Files.** `plugins/plugin-meta/plugins/composition/core/config.ts`, the
registry-gen path in `tooling/plugins/codegen/core/`.

**Risk to watch.** Adding a field/entry bumps the rendered config origin hash,
which can stale an existing user-layer `compositions.jsonc`. Land alone.

### Phase 3 — Namespace identity

One function, `namespaceFor({ composition, checkout })`, owning the elision rule
and the collision guard; every writer and reader derives from it. Then the
gateway change: drop the dot rejection in `parseWorktree` and widen the name
regex in `registry.go`.

**Files.** a core plugin for the rule, `gateway/proxy.go`, `gateway/registry.go`.

**Verify first.** That two-label `*.localhost` resolves in the browsers actually
used. It is the one piece not under our control.

### Phase 4 — Collapse the CLI to one verb

Add `--composition <name...>` (variadic) and `--hermetic` to `build`; delete
`build-composition` and `--serve-composition`. The behaviors that currently
distinguish the two commands become `--hermetic`-conditional: dist target,
materialize, `experimental` marker, checks depth, branch guard, gateway
restart/health probe, `build_runs` row + profile + progress log + verdict guard,
Postgres readiness and DB fork.

Two contracts to preserve:

- **Migration exit codes.** `release` depends on stage 2 exiting `2` on a
  drizzle rename/create prompt and `1` on a missing `--migration-name`.
- **`release` keeps shelling out to a subprocess.** It statically imports plugin
  barrels at module load, so it needs a fresh, unfrozen process.

**Replace, do not delete, the guard.** `cli:build-composition-import-subset`
becomes vacuous once there is one file, but it is the only mechanical check
protecting the ESM-freeze property — that nothing in the CLI's static closure
imports a plugin barrel at module-eval time. A frozen barrel there makes
`pruneOrphanedConfigFiles` delete a freshly-authored config override, silently.
Re-express the check against that property directly.

**Files.** `cli/bin/commands/build.ts`, `build-composition.ts` (deleted),
`cli/bin/cli.ts`, `cli/check/index.ts`, `plugins/build/server/internal/`.

### Phase 5 — Serve compositions from a worktree

Drop the three main-only gates, read the *worktree's* resolved compositions
config rather than `singularity`'s, and point the spec's `server` path at the
worktree's server-core instead of main's. Databases become one per
(composition × checkout).

**Files.** `cli/bin/commands/build.ts` (preflight),
`compose-serve.ts`, `plugins/build/server/internal/handle-serve-composition.ts`.

### Phase 6 — Deploy triggers in the Composition UI

One-off, on-push, and scheduled. The change signal already exists — the plan's
inputs hash; if nothing in the closure changed every artifact is a cache hit and
there is nothing to publish. The schedule must be a `defineJob` with a schedule,
never a timer (no-polling rule). On-push exists today for main only
(`git.refAdvanced` → debounced `build.run`) and now needs to fan out over the
activated set, which `--composition X Y Z` makes a single invocation.

Also update the serve panel copy: with no deactivation sweep, "Still live from an
earlier build; the next main build stops serving it" is no longer true.

**Files.** `plugins/build/plugins/serve-composition/`,
`plugins/apps/plugins/studio/plugins/compositions/`.

### Phase 7 — Deprecate plugin disabling

Replace `singularity.disabled` in package.json with composition excludes.

**Unresolved, and must be settled first.** The two are not the same operation.
Disabling seeds a *reverse* closure — `computeDisabledIds` pulls in descendants
∪ every transitive importer, so disabling X removes everything that imports X. A
composition is purely *additive*: `bundle = hardClosure(entrySeeds ∪
selectedContributors)`, and a `!` negative can only trim ids pulled in
implicitly by a `.**` glob — never an explicit positive, never a hard dependency.
So excluding X while something in the closure imports X yields either a broken
bundle or a silently-ignored exclude. Decide: cascade importers out, or refuse
the exclude loudly.

Second wrinkle: the disabled filter is applied unconditionally in codegen
precisely so the `*-in-sync` checks stay green off committed source. Making it
composition-scoped makes the committed registries composition-dependent.

**Files.** `tooling/plugins/codegen/core/disabled-ids.ts`,
`plugin-meta/plugins/closure/core/resolve-composition.ts`.

---

## Verification

Per phase, but the end-to-end target:

1. `./singularity build --composition sonata` from an agent worktree, on a
   machine where main has **not** been built, succeeds and serves
   `http://sonata.att-XXX.localhost:9000`.
2. `./singularity build --composition sonata website` builds both, and the
   second's artifact count shows reuse rather than rebuild.
3. `./singularity build --composition sonata --hermetic` on a fresh clone with a
   cold store produces a relocatable dist containing only sonata's vendors.
4. `./singularity build` with no flag is byte-equivalent to today's main build.
5. A warm build's `artifacts:vendors` span is small (Phase 0), checked against
   `~/.singularity/worktrees/<wt>/build-profile-<id>.json`.
6. `./singularity check` green throughout, in particular `migrations-in-sync`,
   `plugins-registry-in-sync`, `web-artifacts:map-in-sync`, and whatever replaces
   `cli:build-composition-import-subset`.

## Open decisions

- Namespace: elision (recommended, preserves every current URL) vs uniform
  `singularity.att-XXX`. Phase 3 blocks on this.
- Phase 7's importer-cascade semantics.
- Database lifecycle at (composition × checkout) cardinality — nothing currently
  reaps a composition namespace when its checkout is deleted, and with no
  deactivation sweep, nothing reaps it on deactivation either. May warrant its
  own phase.
