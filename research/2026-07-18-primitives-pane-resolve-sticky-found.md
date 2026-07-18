# Pane resolve guard: sticky-found

## Context

`PaneResolveGuard` (`plugins/primitives/plugins/pane/web/components/pane-resolve-guard.tsx`)
gates every parameterized pane on its `resolve()` hook, which returns
`{ pending, found }`. Resolve hooks derive that from a live-state resource —
e.g. `useResolveTask` returns `{ pending: true, found: false }` whenever
`useResource(tasksResource).pending` is true, and that `pending` is
`!hasValue || error !== null`. So a *transient* error (an HTTP-fallback refetch
failing under host memory pressure) flips `pending` true on a resource that has
been settled for minutes. The old guard rendered `<Component/>` only while
`found`, so it swapped the entire mounted pane for the `Loading` fallback on that
flip. The unmount destroyed the user's scroll position and focus, and cleared
`useEditableField`'s debounce timer *without* flushing — up to 500ms of unsaved
draft lost — then remounted cold on recovery.

## Design decision: sticky-found

Once the guard has observed `found === true` for the current identity, keep the
real pane mounted through any later `pending` flip. Concretely, a latched
`sawFound` per identity, and the render rule:

- `found || (sawFound && pending)` → render `<Component/>` (still resolved, or a
  transient error/refetch on an already-resolved resource — keep it mounted).
- else `pending` → `Loading` (genuine first load, never resolved yet).
- else (`!pending && !found`) → `Not Found`.

**Deletion case.** A settled miss (`!pending && !found`) always downgrades to
Not Found, regardless of `sawFound`. So a task genuinely deleted while its pane
is open still surfaces Not Found — stickiness masks transient errors, never real
deletion. This falls out of the rule for free: `sawFound && pending` is false
once `pending` is false.

**Reset rule.** Stickiness is keyed on `(pane.id, params)`. A `swap` open
re-roots a pane in place — new params, but the layout renderers
(`miller`/`full-pane`) pass `params` as a prop to a guard they do **not**
remount, so the guard instance and its `sawFound` would otherwise carry over to
a different resource. The guard renders an inner `StickyResolveGuard` under
`key={resolveIdentity(pane.id, params)}`; React gives a fresh instance (fresh
`sawFound`) whenever identity changes, and keeps the instance — hence the
stickiness — stable across transient `pending` flips (identity unchanged).
`sawFound` latches via a `!sawFound`-guarded `setState` during render (React's
sanctioned derive-state-from-props pattern), so no ref-in-render and no effect.

## Rejected alternatives

- **Key the guard from the layout renderers** (`key={identity}` at the
  `<PaneResolveGuard>` call sites) — pushes a pane-internal invariant into every
  layout plugin and leaves the guard unsafe for any future caller. The reset
  belongs inside the guard.
- **Treat any `pending` as "keep last render"** (drop the found/not-found
  distinction) — would also mask a genuine deletion behind the stale pane, since
  a delete settles as `!pending && !found`; the sticky rule must still downgrade
  on a settled miss.
