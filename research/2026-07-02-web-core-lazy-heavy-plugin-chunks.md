# Cold-boot: move heavy libraries off the boot-awaited plugin wave

**Date:** 2026-07-02
**Category:** global (framework/web-core + several feature plugins)
**Follow-up to:** `perf(boot): stop shipping the full react-icons/md set in the eager entry chunk` (1aeb6ca4d)

## Problem

`loadPlugins(webEntries)` in `plugins/framework/plugins/web-core/web/App.tsx`
`Promise.allSettled`s **every** plugin's dynamic `import()` and awaits the whole
wave (plus `runBootTasks`) before the first `setState` / paint. Each barrel is a
separate chunk, but they are all fetched/parsed/evaluated at boot regardless of
which app is visible. Any heavy library statically reachable from a plugin's
`web/index.ts` (including via a bare `export { X } from "./x"` re-export, which
forces module evaluation) therefore lands on the boot-critical path even when its
component never renders.

Measured heavy libraries on the boot wave (gzip, approx): react-markdown ~169KB,
@xyflow/react + dagre ~165KB, lexical ~132KB, plus sonata's pixi.js / vexflow /
smplr / @tonejs/midi, and katex. `shiki` is **already** off the path (a real
`import("shiki")` inside `getHighlighter`) — the model we replicate.

There is **zero** use of `React.lazy` / `Suspense` anywhere in `web/` today, and
there is no Suspense boundary in the slot-render middleware chain, the pane render
path (`PaneResolveGuard` renders `<Component/>` directly), or the app-surface mount
(`TabSurface` → `renderIsolated(Apps.App.id, app)`). So a lazy component needs to
bring its **own** Suspense boundary.

## Two levers (from the task)

1. **Lazy boundaries inside heavy plugin components** — move each heavy lib into a
   chunk reached only via `React.lazy(() => import(...))`, so it drops off the boot
   `Promise.allSettled` and loads on first mount.
2. **Progressive plugin loading** — split `loadPlugins` into a boot-critical set
   (framework + shell + apps-core + the landing app closure) that paints first,
   then load the rest and merge into `PluginProvider`.

## Decision

**This effort implements Lever 1 in full. Lever 2 is deferred to a follow-up.**

Rationale: Lever 1 is self-contained, low-risk, and directly removes the dominant
byte cost from the boot wave with per-component granularity and (for the shared
primitives) **zero consumer changes**. Lever 2 is a large architectural change to
load-bearing boot code + codegen (`plugin-registry-gen.ts`) + a validity check,
with real correctness hazards (slot contributions appearing after first paint;
route matching before an app's panes have loaded). It reuses the existing
composition-closure machinery (`resolveComposition` on the per-app manifest, the
`@composition-web-registry` import seam, `CollectedEntry.dependsOn` pruning) but
must be designed and rolled out on its own with in-app verification. It is filed as
a follow-up task, not implemented blind here.

## The primitive: `primitives/plugins/lazy-component`

A single self-contained primitive so the boundary is DRY and consistent, and works
regardless of where the component mounts (slot, pane, or app surface):

```ts
// primitives/plugins/lazy-component/web
export function lazyComponent<P extends object>(
  loader: () => Promise<{ default: ComponentType<P> }>,
  opts?: { fallback?: ReactNode },
): ComponentType<P>
```

Returns a component that renders `<Suspense fallback={fallback}><Lazy {...props}/></Suspense>`.
`React.lazy` caches the resolved module, so only the **first** mount in a session
suspends; subsequent mounts render synchronously. The default fallback is a delayed
`<Loading variant="spinner" />` (the Loading primitive's ~120ms CSS delay means a
fast chunk load never flashes). Named exports use the standard idiom
`lazyComponent(() => import("./impl").then(m => ({ default: m.Foo })))`.

Why a per-component boundary (not an ambient slot-middleware Suspense): deep/inline
heavy components (markdown inside the conversation transcript, the compose-bar
editor) must suspend **locally** so only that node shows a fallback — an ambient
boundary at the pane/app seam would blank the whole pane. The primitive gives
correct granularity everywhere and needs no changes to load-bearing render infra.

## Application sites (Lever 1)

Pattern for the shared primitives (barrel `export { X } from "./x"`, heavy static
import in `./x`): rename the heavy module to `*-impl`, and make the barrel-exported
`X` a `lazyComponent(() => import("./x-impl")…)`. Every synchronous consumer keeps
`import { X }` and `<X/>` unchanged.

| Lib | Plugin | Approach |
|---|---|---|
| react-markdown | `primitives/markdown` | Split `MarkdownRenderer` (react-markdown + base-components) into a lazy `*-impl`; keep the `Markdown` wrapper + `MarkdownEnhancerSlot` eager (wrapper reads the enhancer slot hook, renders lazy renderer). |
| @xyflow/react + dagre | `primitives/graph-canvas` | Barrel `GraphCanvas` → `lazyComponent` over the current `graph-canvas.tsx` (→ `graph-canvas-impl.tsx`). Covers workflows, studio graph, task-graph — zero consumer changes. |
| lexical | `primitives/text-editor` | Barrel `TextEditor` → `lazyComponent`. Keep the `Plugin` slot + `registerNodeExtension` + types eager (verify they don't statically pull `lexical`). Covers prompt input + task description + all consumers. |
| katex | `page/math/render` | Barrel `KatexMath` → `lazyComponent`. |
| pixi.js | `sonata/piano-roll` | `Sonata.Display({ component: lazyComponent(() => import("./components/piano-roll")…) })`. |
| vexflow | `sonata/notation` | `Sonata.Display({ component: lazyComponent(() => import("./components/notation")…) })`. |
| smplr | `sonata/audio/{piano,soundfont}` | Move `import "smplr"` behind a dynamic `import()` inside the async `createVoices`/`createSoundfontVoices` factory (headless — no component; mirror shiki). |
| @tonejs/midi | `sonata/sources/midi` | Move `import "@tonejs/midi"` behind a dynamic `import()` inside the async `parseMidi` compile fn. |
| shiki | `primitives/syntax-highlight` | **Already lazy** — no change. |

Out of scope this pass (own follow-up): the full `page/editor` block editor's
direct `@lexical/*` fan-out (Pages-app + inline editors — a dozen lexical plugin
modules with node-registration timing to reason about) and `active-data`'s inline
lexical node.

## Verification

- `VITE_ANALYZE=1 VITE_OUT_DIR=/tmp/dist-analyze bunx vite build` + inspect the
  eager set (`dist/index.html` script/modulepreload list) — each heavy lib must no
  longer appear in an eager chunk.
- In-app (Playwright): conversation compose bar (editor focus + no layout jump),
  task detail (description editor), a workflow definition graph, a sonata display,
  a markdown-heavy transcript, a page equation. Watch for fallback flash / focus
  loss / CLS.
- Debug → Boot Profile for the request→first-paint timeline.

## Follow-ups to file

1. **Lever 2 — progressive boot-critical plugin loading.** Reuse
   `resolveComposition` + `@composition-web-registry` seam to split `webEntries`
   into an eager boot-critical set (served-baseline + framework/shell/apps-core +
   default-app closure) loaded before paint, and a deferred rest loaded on first
   navigation to their owning app (`resolveAppForPath` is the trigger). Must handle
   late slot contributions and route-match-before-load. Note: the current
   `default: true` app is Home (`apps.home`), not agent-manager.
2. **page/editor lexical + active-data inline node** — apply the same lazy boundary
   to the Pages block editor.
3. Possibly a lint rule: a heavy-lib allowlist that flags a new static import of a
   known-heavy package outside a `lazyComponent`/dynamic-import boundary.
