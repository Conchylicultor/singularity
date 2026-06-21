# On-demand React fiber-commit profiler

**Date:** 2026-06-21
**Status:** design → implementation

## Problem

Diagnosing a re-render loop today needs ad-hoc, hand-rolled instrumentation. The
always-on **DOM render-loop detector** (`plugins/reports/plugins/render-loop`)
tells you THAT a subtree is thrashing and roughly WHERE (a DOM culprit
signature), but not WHICH React component — and which hook/subscription — is the
*initiator* driving the loop.

Motivating case: an idle conversation transcript re-renders its whole
assistant-text / markdown subtree ~3–4×/s. The DOM detector flags the subtree
but cannot name the initiator (e.g. "a `useSyncExternalStore` in `JsonlPane`
ticks every ~1s").

## Goal

An **on-demand** React fiber-commit profiler that, when explicitly enabled,
attributes each commit to its **initiating component** — the shallowest fiber
that re-rendered because of its *own* state/context/subscription, vs. children
re-rendering only as propagation — and surfaces the **offending hook** (index +
inferred kind). Aggregated over a short session it yields:
"component X, hook N (useSyncExternalStore), ~3.5 commits/s".

**OFF by default**: a session walks the fiber tree per commit, so the walk is
gated behind an explicit start. (A passive commit *bridge* is always present —
see below — but its always-on cost is one `Set.size` check per commit.)

## Mechanism

### 1. Passive commit bridge (always installed, pre-React)

React's renderer reads `window.__REACT_DEVTOOLS_GLOBAL_HOOK__` once, when
`react-dom/client`'s module initializes (before `createRoot().render()`). If the
global is absent at that moment, React never emits commit callbacks and nothing
later can retro-register. So a minimal passive hook must exist **before React
loads**.

The only correct insertion point is an inline `<script>` in
`plugins/framework/plugins/web-core/web/index.html` `<head>`, before the
`<script type="module" src="/main.tsx">` tag. This mirrors the existing
pre-paint theme-replay inline script — the established "must run before
everything" pattern in this codebase.

The inline script is **generic and passive** ("React commit bridge"), with no
profiler logic:

- If no hook exists, install a minimal shim: `supportsFiber: true`, `isDisabled:
  false`, a `renderers` map, a real `inject()` returning incrementing ids, and
  no-op `onCommitFiberUnmount` / `onPostCommitFiberRoot` / `onScheduleFiberRoot`
  / `checkDCE`. `onCommitFiberRoot(rendererId, root)` notifies a
  `__commitSubscribers: Set<(root) => void>` — and returns immediately when the
  set is empty (the always-on cost).
- If a hook already exists (real React DevTools extension present), **augment**
  it: ensure `__commitSubscribers` exists and wrap `onCommitFiberRoot` exactly
  once to also notify subscribers. This lets the profiler and the DevTools
  extension coexist.

Always-on overhead: merely having a no-op hook does **not** enable React's
profiler timers (those need `<Profiler>`/the profiling build), so the cost is
the `onCommitFiberRoot` call + a `Set.size === 0` early-return per commit —
negligible. Only the per-commit fiber **walk** is expensive, and that runs only
during a session.

### 2. Per-commit fiber analysis (only while a session is active)

On each commit the bridge hands us `root` (a `FiberRoot`); we read
`root.current` (the committed tree) and walk it iteratively via
`child`/`sibling`/`return`.

**Did this fiber render?** For function/class/forwardRef/memo components, the
reliable signal — the same one React DevTools and `bippy` use — is the
`PerformedWork` flag (`fiber.flags & 0b1`). It is set when a component runs its
render function (not on bailout) and survives into the committed tree. We treat
`(flags & PerformedWork) !== 0` as "rendered" for component fibers.

**Initiator vs. propagation.** A rendered component fiber is an **initiator**
iff none of its ancestors rendered — i.e. it is the *topmost rendered fiber*
along its path. Rationale: if the parent did **not** render, this fiber
re-rendered on its own (a scheduled update on itself: state, reducer, context,
or external store). If an ancestor rendered, this fiber's render is propagation
from that ancestor. Multiple independent updates in one commit yield multiple
initiators (one per path). This is exactly "the shallowest fiber that
re-rendered because of its own state/context, vs. children re-rendering only as
propagation".

**Which hook?** For each initiator we diff against its `alternate` (the previous
fiber) to find the offending hook(s):

- Walk the `memoizedState` hook linked list of both the current fiber and its
  `alternate` in lockstep. For each hook index, classify by shape and detect
  change:
  - **state / reducer**: hook has a `queue` with `lastRenderedReducer`;
    `hook.memoizedState !== alt.memoizedState` ⇒ changed at index N.
  - **external-store** (`useSyncExternalStore`): hook's `queue` carries a
    `getSnapshot` function; `hook.memoizedState !== alt.memoizedState` ⇒ the
    store snapshot changed. **This is the key one** — TanStack Query's
    `useQuery` (and thus live-state's `useResource`) lands on
    `useSyncExternalStore` inside the calling component's fiber.
  - **effect / layout-effect**: memoizedState is an Effect (`{ tag, create, deps
    }`) — does not cause renders, but counted so the hook **index** is accurate.
  - **memo / callback**: memoizedState is `[value, deps]`.
  - **ref**: memoizedState is `{ current }`.
- **context**: contexts are not in the hook list; they live on
  `fiber.dependencies` (a linked list of context items with `memoizedValue`).
  Diff each item's `memoizedValue` against the alternate ⇒ context changed.
- If nothing changed but props differ (`memoizedProps !== alt.memoizedProps`),
  label "props" (rare for a true initiator; usually means a host parent).

The report names "component X, hook #N (kind)" — the index matches the order of
hook calls in the component source. (We label every hook so indices line up even
when the offending one is a uSES buried among effects/refs.)

**Component name.** `getComponentName(fiber)` resolves
`type.displayName ?? type.name` (unwrapping forwardRef `.render` and memo
`.type`). A short ancestor-name path (e.g. `JsonlPane › JsonlPaneInner`)
disambiguates duplicate component names and gives the report location context.

### 3. Session + aggregation

A session = register the commit subscriber, accumulate stats, auto-stop after a
max duration (default 30s; configurable), then unregister.

- Aggregate by **initiator signature** = ancestor-name path + component name +
  the changed-hook descriptor. For each signature: commit count, first/last
  `performance.now()` timestamps ⇒ rate (commits/s), and the changed-hook list.
- A throttled flush (≤ ~4×/s) writes the current ranked snapshot into a
  module-level external store the pane subscribes to, and (on stop)
  `clientLog("render-profiler", …)` dumps the ranked report to the per-worktree
  JSONL so headless/agent runs can read root-cause without the UI.

**Self-exclusion.** The profiler's own pane components are registered in an
exclude set (by component reference); initiators whose nearest named component
is excluded are dropped, so the pane's own churn never pollutes results (mirrors
the DOM detector excluding the toaster/picker). Combined with the throttled
flush this keeps the tool from profiling itself.

## Surfaces

1. **Debug → Render Profiler pane** (`plugins/debug/plugins/render-profiler`)
   — human-facing. Start/Stop toggle, live counters (total commits, commits/s),
   and a ranked list of initiators: component name, ancestor path, count, rate,
   and offending-hook badges. Sibling of `live-state-health` /
   `health-monitor`. Off until Start.

2. **`window.__reactRenderProfiler`** global API (`start(opts)`, `stop()`,
   `getReport()`, `isRunning()`) — drives the same engine. Used by the pane and
   by headless callers.

3. **Playwright helper `e2e/render-profile.mjs`** — agent-facing. Opens a URL,
   `start()`s a session, waits N seconds, prints the ranked report to stdout
   (and the JSONL gets the same dump). The headless path for agents diagnosing a
   loop, since agents work without the UI.

4. **Debug skill** (`.claude/skills/debug/SKILL.md`) — a new section documenting
   the profiler as the on-demand root-cause counterpart to the always-on DOM
   render-loop detector, with the Playwright one-liner.

## Plugin layout

```
plugins/debug/plugins/render-profiler/
├── package.json
├── CLAUDE.md
├── core/
│   ├── index.ts            # barrel: channel name, global-api key, report types
│   └── types.ts            # ProfilerReport, InitiatorStat, HookChange, HookKind
└── web/
    ├── index.ts            # barrel: Pane.Register + DebugApp.Sidebar + Core.Root(installer)
    ├── panes.tsx           # Pane.define + PaneChrome body
    ├── components/
    │   ├── render-profiler-pane.tsx   # Start/Stop + live ranked list
    │   └── initiator-row.tsx
    └── internal/
        ├── react-types.ts   # Fiber/FiberRoot minimal types + WorkTag/flag consts
        ├── fiber-walk.ts     # didFiberRender, getComponentName, walk, initiators
        ├── hook-classify.ts  # hook-list + dependencies diff → HookChange[]
        ├── session.ts        # session lifecycle, aggregation, throttled flush, external store
        └── global-api.ts     # install window.__reactRenderProfiler + exclude-set registry
```

Plus, in `framework/plugins/web-core/web/`:
- `index.html` — add the passive commit-bridge inline `<script>`.
- `vite.config.ts` — `esbuild: { keepNames: true }` so the minified build keeps
  real component/function names (otherwise the report shows mangled `n`/`t`
  names). Benefits all debugging (stack traces, crash reports), small bundle
  cost. Clean enabler, not a hack.

## Why this design

- **Pre-React bridge in index.html** is the only correct place; the precedent
  (theme replay) exists. Keeping the inline script generic (a commit bridge, no
  profiler logic) avoids coupling the framework to the debug plugin's internals.
- **PerformedWork + topmost-rendered-fiber** is the same battle-tested approach
  React DevTools / bippy use; it needs no profiling build and survives commit.
- **Hook memoizedState diff** is what turns "this subtree thrashes" into "hook
  #N (useSyncExternalStore)" — directly serving the motivating live-state case.
- **External store + throttled flush + self-exclude** keeps the always-expensive
  part gated and prevents the tool from profiling its own UI.
- Reuses existing primitives throughout: `Pane`, `PaneChrome`,
  `DebugApp.Sidebar`, `sidebarNavItem`, `clientLog` (log-channels), CSS
  primitives (`Stack`/`Row`/`Text`/`Badge`/`ToggleChip`/`Column`/`Scroll`).

## Caveats / follow-ups

- **Minified names**: addressed via `keepNames`. If a future build strips it,
  reports degrade to fiber tags; the engine falls back gracefully.
- **React internals coupling**: fiber field names (`flags`, `memoizedState`,
  `dependencies`, `alternate`) and `PerformedWork`/WorkTag constants are private
  React API. They are stable across React 18–19 and mirror DevTools/bippy, but a
  major React upgrade could shift them. Centralized in `internal/react-types.ts`
  with defensive fallbacks; a follow-up could add a tiny smoke test asserting
  the shim still receives commits.
- **Self-profiling**: handled by the exclude set + throttle, but a session left
  running indefinitely is wasteful — hence the auto-stop.
</content>
