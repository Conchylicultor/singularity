# Web

The SPA composition root. This plugin is **only** bootstrap — it owns the Vite /
Tailwind / TypeScript build for the whole frontend and the React entry point, and
nothing else. No SSR, no SEO concerns.

The foundational UI layer (the `cn()` util, the shadcn/ui primitives, the global
`theme/app.css` stylesheet, and the `ControlSize` affordance-sizing context) used
to live here behind an ambient `@/*` alias. It now lives in its own boundary-legal
plugin, [`primitives/ui-kit`](../../../primitives/plugins/ui-kit/CLAUDE.md);
consumers import `@plugins/primitives/plugins/css/plugins/ui-kit/web`. The `@/*` alias has been
deleted, so a stray `@/` import is now an unresolved-module error at build time.

## Stack

- **Vite** — Build tool and dev server (this plugin is the build root)
- **React 19** + **TypeScript**
- **Tailwind CSS v4** — `@tailwindcss/vite` plugin; the global stylesheet
  (`app.css`) lives in `primitives/ui-kit` and is imported from `web/main.tsx`.
- **react-icons** — Icons (predominantly `react-icons/md`; not Lucide)

## Structure

- `web/` — SPA bootstrap only
  - `App.tsx` / `main.tsx` / `index.html` — the React entry + plugin loader
  - `components/plugin-load-errors.tsx` — boot-error surface
  - `__tests__/` — render smoke tests
  - `public/` — static assets

## Commands

Always go through `./singularity build` from the repo root.

### Frontend build modes

`./singularity build` has two frontend modes (announced by a `Frontend mode: …`
line at the top of every build):

- **Per-plugin web artifacts — the DEFAULT** for normal builds (agent branches
  and main). Each plugin's `web/` barrel (plus every statically or dynamically
  imported folder barrel — `core`, `fixtures`, …) builds into an independent,
  content-addressed ES-module artifact; the browser composes them via an inline
  import map in `dist/index.html`. Only changed plugins rebuild (typical warm
  step: a few seconds vs minutes for the monolith). Artifacts are stored in
  `~/.singularity/web-artifacts/` (`store/` per-plugin artifacts, `vendors/`
  npm pre-bundles, `css/` cached global Tailwind passes, `fingerprints/` stat
  caches), shared across all worktrees, pruned by age. `dist/` symlinks into
  the store. Guarded by the `web-artifacts:map-in-sync` and
  `web-artifacts:no-vendored-state-inlined` checks; engine lives in
  [`framework/tooling/web-artifacts`](../tooling/plugins/web-artifacts/CLAUDE.md).
  `--no-minify` skips esbuild minification for debugging (hash input).
- **Monolithic Vite build — the rollback escape hatch** (`bun run build` here):
  force it with `./singularity build --monolith` or `SINGULARITY_WEB_MONOLITH=1`.
  Precedence: explicit flag > env > default. `--artifacts` /
  `SINGULARITY_WEB_ARTIFACTS=1` are accepted no-ops from the opt-in phase.
- **Release/composition builds are ALWAYS monolithic** — `--composition` (and
  therefore `./singularity release`, which shells out to it) unconditionally
  uses the optimized Rollup build regardless of flags/env.

The bundle-analysis and `manualChunks` guidance below applies to the monolithic
mode (and to release bundles); in artifact mode, eager-boot bytes are governed
by the eager tier's `modulepreload` closure instead.

### Bundle analysis (eager boot bytes)

The frontend boot cost is dominated by the **eager set** — the entry chunk plus its
static-import chunks (the `<script>` + `<link rel="modulepreload">` list in
`dist/index.html`). To see exactly what's in it:

```bash
cd plugins/framework/plugins/web-core
VITE_ANALYZE=1 VITE_OUT_DIR=/tmp/dist-analyze bunx vite build   # skips tsc; just the bundle
# → writes web/dist.stats.html (treemap, gzip + brotli per chunk). Open it.
# eager set = grep -oE '(src|href)="[^"]*\.js"' /tmp/dist-analyze/index.html
```

`manualChunks` (in `vite.config.ts`) deliberately splits **only react core**. Do NOT
group a *partially-lazy* heavy library (react-icons, shiki, react-markdown, lexical,
…) into one named chunk: Rollup's default chunking already splits such a package into
an eager-used slice and lazy-used slices, and forcing the whole package into one chunk
**unions** them onto the boot path — measured to balloon the eager set from ~715 KB
gzip to ~2.4 MB. Only group libraries that are fully eager regardless (react/react-dom/
scheduler), where isolating them is a pure cross-deploy caching win with zero eager cost.

**Never namespace-import a big icon package.** A dynamic or `import * as` namespace
import of `react-icons/md` (`mdModule[key]`) forces Rollup to retain *every* icon
(the package is un-tree-shakeable through a namespace) and, because hundreds of
barrels also import named icons eagerly, hoists the whole ~2 MB set into the eager
entry chunk (once measured at **417 KB gzip = 62 % of the entry chunk**). Import
named icons (`import { MdFoo }`) so tree-shaking keeps only the used union, or render
stored `SvgNode` data (see `primitives/icon-picker`). Enforced by the
`icon-safety/no-namespace-react-icons` lint rule; the sole exemption is the
build-time `gen-icon-svg-map.ts` (never bundled).

This is the static-bytes counterpart to the **Debug → Boot Profile** pane (the
request→first-paint *timeline*) and the Boot Gantt.

### Tests

The vitest DOM suites here (`web/__tests__/`) need the browser stack (jsdom + the `@plugins` alias + `.css` imports + React rendering), which `bun:test` can't provide. They are discovered and run by the **repo-wide** vitest project (root `vitest.config.ts` + `test/setup.ts`), not a per-plugin config — see the root `CLAUDE.md` Testing section. One suite lives here: `plugin-render.test.tsx` (full plugin-graph load smoke).

`plugin-render.test.tsx` is a **load-only smoke**: it asserts `loadPlugins(webEntries)` returns zero errors and every contribution is structurally well-formed. It does not render contributions — a contribution needs its slot's props/context, so bare rendering is meaningless. Run from the repo root (optional):

```bash
bun run test:dom                                                              # whole DOM suite
bun run test:dom plugins/framework/plugins/web-core/web/__tests__/plugin-render.test.tsx   # one file
```

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Web:
  - Uses:
    - `primitives/css/text.Text`
    - `primitives/css/ui-kit`
    - `primitives/error-boundary.PluginErrorBoundary`
    - `primitives/live-state.ensureNotificationsClient`
    - `primitives/live-state.NotificationsProvider`
    - `primitives/perfs/boot-trace.markBootInstant`
    - `primitives/perfs/boot-trace.startBootSpan`
    - `primitives/perfs/scheduler.yieldToMain`
- Cross-plugin:
  - Imported by: `framework/tooling/web-artifacts`
- Core:
  - Exports (types):
    - `BabelPluginItem`
    - `OrderedBabelContribution`
    - `ViteContributionReturn`
  - Exports (values):
    - `findViteContributions`
    - `loadBabelContributions`
- Structure:
  - Loose top-level files: `vite.config.ts`
  - Composition root: yes

<!-- AUTOGENERATED:END -->
