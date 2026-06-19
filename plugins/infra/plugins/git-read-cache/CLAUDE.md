# git-read-cache

A small server-side infra library — `createGitStateMemo` — that memoizes an
expensive, gated git recompute behind a **cheap, ungated signature probe**. It is
a pure library: a server barrel only (it uses the profiler and is never
browser-safe) with **no default `ServerPluginDefinition` contributions**, exactly
like `host-read-pool`. Three live-state levers collapse into this one
abstraction.

## The git-state-keyed memo

> Read a **cheap, ungated signature** → on a signature match return the cached
> value **with no heavy slot acquired** → on a miss, single-flight the gated
> recompute and cache the result keyed by that signature.

`get(worktreePath, signatureFn, computeFn)`:

1. `signatureFn()` — the cheap, ungated probe. It runs on **every** call, so it
   must stay ~sub-millisecond (e.g. one ungated `rev-parse`, or a SHA git-watcher
   already holds in memory). It fingerprints **every input the result reads**.
2. signature unchanged ⇒ return the cached value immediately. **A hit acquires
   no heavy slot** — neither the per-worktree nor the host-wide
   `withHeavyReadSlot` is ever touched. This is the whole point: the storm path
   (a `main` advance fanning across ~16 worktrees and every open view) becomes
   mostly memo hits doing zero git work.
3. signature changed ⇒ run `computeFn()` under an embedded per-worktree
   single-flight and cache `{ signature, value }`. **`computeFn` owns its own
   `withHeavyReadSlot`** — the memo never touches the gate itself, so the gated
   recompute happens exactly where the compute body decides.

### Cheap-ungated-signature vs gated-compute split

The signature is deliberately the *thin ungated* read (`host-read-pool`
deliberately keeps cheap interactive git ungated), while the heavy `git log`/diff
body lives in `computeFn` behind the heavy-read gate. The split is what lets a hit
skip the gate entirely.

### Write-through prime — `set(worktreePath, signature, value)`

For an **authoritative external writer** that already holds both the value and the
signature it belongs to, `set` stores `{ signature, value }` directly — bypassing
`signatureFn`/`computeFn`. The next `get` whose `signatureFn` returns the same
signature is then a pure cache hit: no `computeFn`, no heavy slot.

The motivating consumer is **edited-files**. The @parcel watcher is the sole
source of truth for working-tree state; it computes the file list directly
(un-memoized, so it never reads its own cache) and `set`s it under a **monotonic
generation** signature it bumps on every completed recompute. The loader's `get`
uses that generation as its `signatureFn`, so a read between file changes hits the
watcher's latest list with zero git work. This is the only sound signature for
edited-files: an uncommitted save changes the working-tree diff **without moving
any SHA**, so a git-SHA signature would serve stale data — the generation counter,
driven by the watcher (the real change signal), is what keeps it never-stale.

`set` is the writer's responsibility for correctness: it must only store a value
it knows matches the signature it passes. The 3-arg `get` signature is unchanged.

### Embedded single-flight + worktree-keyed coalescing

An embedded `createInflight` (`@plugins/packages/plugins/inflight/core`), keyed by
`worktreePath`, folds stacked concurrent recomputes into one execution
(skip-in-flight). Because the key is the **worktree** (not conversationId /
attemptId), N conversations — and the delta+graph of one attempt — collapse onto
one compute + one cached value (coalesce fan-out).

## Staleness contract (non-negotiable: never serve stale)

- The signature **must be a faithful function of every input the result reads**.
  If the result depends on `HEAD`, `main`, the merge-base, and a pushed-shas set,
  all four belong in the signature — otherwise a change to an omitted input
  serves stale data.
- The signature is captured **before** the inflight body runs, so a second caller
  arriving with a *different* signature mid-flight shares the in-flight result.
  That shared result may be **≤1-event stale**; the next notify re-probes and
  recomputes if the signature has since moved. This mirrors the runtime
  single-flight's existing staleness-sharing contract.
- `evict(worktreePath)` drops a worktree's entry on the subscription lifecycle
  (e.g. `onLastUnsubscribe`); a later re-subscribe re-probes cheaply with one cold
  compute.

## Observability

A hit charges a 0ms `git-memo-hit:<name>` marker and a miss a 0ms
`git-memo-miss:<name>` marker via `chargeWait` (`runtime-profiler/core`). 0ms is
sound: with an active entry it adds 0 to the wait accumulator (no timing
pollution), and with no active entry it records a 0ms `db [git-memo-hit:<name>]`
span — a pure hit-rate signal. The 3-arg `get` signature is fixed; observability
never changes it.

## Consumers

The two git live-state loaders consume it: **commits-graph** (its `delta` resource
via the generic memo; its `graph` resource keeps a bespoke two-half cache for its
genuinely-special split-signature incrementality) and **edited-files** (coalescing
+ skip-in-flight, with the @parcel watcher as the cache writer via a monotonic
generation signature).

See `research/2026-06-19-global-incremental-git-loaders.md` (the unifying
primitive and Stage 2.1).

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Git-state-keyed result memo: skip a gated git recompute when a cheap ungated signature is unchanged; single-flight + coalesce per worktree.
- Cross-plugin:
  - Imported by: `conversations/conversation-view/code`, `conversations/conversation-view/commits-graph`
- Server:
  - Exports: Types: `GitStateMemo`; Values: `createGitStateMemo`

<!-- AUTOGENERATED:END -->
