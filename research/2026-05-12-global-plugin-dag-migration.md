# Plugin DAG Migration: Top-Level Directories → Regular Plugins

## Context

The plugin system currently has an artificial boundary: `plugin-core/`, `server/`, `web/`, `cli/`, `tooling/`, and `central/` are special top-level directories that sit outside the plugin DAG. Plugins can import from `server/` via `@server/*`, but `server/` cannot import from plugins. This prevents natural patterns like a `logs` plugin whose foundational API the server bootstrap uses.

The fix: make every top-level directory a regular plugin under `plugins/`. The dependency graph becomes a true DAG enforced by the boundary checker's zone system. This plan covers phases 3–7 (phases 1–2 — rename `shared/` → `core/`, add `internal/` zone — are scoped separately).

## Alias Transition Strategy (applies to all phases)

Each top-level directory has a path alias (`@core`, `@server/*`, `@tooling/*`). On move, the alias is **retargeted** in tsconfig/vite config to point to the new location. Zero consumer files change their import text. A follow-on cleanup can later migrate imports to `@plugins/*/core` form, but it's not required for correctness.

Concretely, three files absorb each alias retarget:
- Root `tsconfig.json` (paths)
- `web/vite.config.ts` (Vite resolve.alias) — until web itself moves
- Consumer tsconfig files (`server/tsconfig.json`, etc.)

After each phase, the moved directory's explicit entry in root `package.json` workspaces is deleted — `plugins/**` already covers the new location.

## Phase 3: `plugin-core/` → `plugins/plugin-core/`

**Why first:** Everything imports `@core`. Moving this first proves the alias-retarget strategy works.

### What moves

```
plugins/plugin-core/
  core/              ← public barrel (zone: core)
    index.ts         ← re-exports: defineSlot, defineCommand, PluginProvider, etc.
    types.ts, slots.ts, commands.ts, context.tsx, loader.ts
  internal/          ← private (zone: internal)
    topo.ts
```

All exports are runtime-agnostic. No `server/` or `web/` barrels.

### Import paths

`@core` → retarget from `plugin-core/` to `plugins/plugin-core/core`. ~150 consumer files unchanged.

### Boundary checker

- `boundary.config.ts`: remove `zone("core", { match: "plugin-core" })` and its 5 `allow("... -> core")` edges. The plugin becomes `plugin.plugin-core`, covered by `allow("plugin.** -> plugin.**")`.
- `resolve.ts`: update the `@core` specifier branch to resolve to zone `plugin.plugin-core`.
- `no-plugin-imports-in-core.ts`: update to protect `plugins/plugin-core/` instead of `plugin-core/`.
- `plugin-registry-gen.ts`: `typeImport` for web runtime uses `@core` alias — still works after retarget.

### Build system

- Root `package.json` workspaces: remove `"plugin-core"`.
- tsconfig `include` paths in `server/tsconfig.json` and `web/tsconfig.app.json`: retarget `../plugin-core/` → `../plugins/plugin-core/core/`.

### Key risks

- `context.tsx` imports `./topo` relatively → after move it becomes `../internal/topo`. Must update the import.
- tsconfig `include` globs must find the new location for type-checking.

### Done when

- `./singularity build` and `./singularity check` pass.
- `plugin-core/` deleted from repo root.
- All `@core` imports resolve identically.

---

## Phase 4: `server/` → `plugins/server/`

**Why second:** This is the most valuable phase — it unlocks the original pain point (plugins depending on server infra). Also the most complex structurally because `server/` plays two roles: a framework library and a Bun process entry point.

### What moves

```
plugins/server/
  core/              ← public barrel (zone: core) — the framework API
    index.ts         ← re-exports: types, resources, contributions, error-reporter, profiler
    types.ts           (89 imports across plugins)
    resources.ts       (32 imports)
    contributions.ts   (1 import)
    error-reporter.ts  (3 imports)
    profiler.ts        (1 import)
  server/            ← server barrel (zone: server) — the process entry point
    index.ts         ← Bun.serve, route tables, lifecycle (current server/src/index.ts)
    plugins.ts       ← composition root (excluded from boundary checks)
    plugins.generated.ts
    internal/
      topo.ts
      paths.ts
```

### Import paths

`@server/*` → retarget from `server/src/*` to `plugins/server/core/*`. 126 consumer files unchanged.

### Boundary checker

- `boundary.config.ts`: remove `zone("server", { match: "server" })` and `allow("plugin.** -> server")`. Plugin becomes `plugin.server`.
- `resolve.ts`: update `@server/` specifier branch to resolve to `plugin.server`.
- `exclude` list: update `server/src/plugins.ts` → `plugins/server/server/plugins.ts`, same for `plugins.generated.ts` and `index.ts`.
- `plugin-registry-gen.ts`: update `RUNTIMES.server.registryFile` and `generatedFile` paths. Fix `typeImport` (currently `import ... from "./types"` — needs to become `import ... from "@server/types"` since the generated file is no longer colocated with types.ts).

### Build system

- `singularity` entry script and `cli/src/commands/build.ts`: update server path from `resolve(root, "server")` to `resolve(root, "plugins/server")`.
- Gateway: verify how it resolves the server entry point from the worktree spec JSON. The gateway receives a path and runs `bun <path>/server/index.ts` — confirm and update.
- `tsc` invocation in build.ts: `resolve(root, "server")` → `resolve(root, "plugins/server")`.

### Key risks

- **Bun entry point resolution.** The gateway spawns the server process. The spec JSON written by `build.ts` must point to the correct entry. If the gateway hardcodes `src/index.ts` relative to the spec path, it needs updating to `server/index.ts`.
- **Module identity.** `resources.ts` uses module-level singletons. All imports must resolve through the same canonical path (the retargeted alias ensures this).

### `central/` note

`central/` is structurally identical to `server/` (same types.ts/resources.ts/topo.ts pattern, own CentralPluginDefinition). A Phase 4b can move it using the exact same strategy. Not included here due to CLAUDE.md restrictions ("NEVER modify central/ unless explicitly instructed"). The boundary config retains `zone("central", ...)` until then.

### Done when

- `./singularity build` succeeds, server boots, `/api/health` returns 200.
- `./singularity check` passes.
- `server/` deleted from repo root.
- All `@server/*` imports resolve identically.

---

## Phase 5: `web/` → `plugins/web/`

**Simplest phase.** No cross-boundary consumers. Pure Vite SPA entry point.

### What moves

```
plugins/web/
  web/               ← web barrel (zone: web) — the SPA entry
    main.tsx
    App.tsx
    plugins.ts, plugins.generated.ts
    components/, hooks/, lib/, theme/
  vite.config.ts
  tsconfig.app.json, tsconfig.json, tsconfig.node.json
```

### Import paths

No external consumers. Internal `@/*` alias retargeted from `./src/*` to `./web/*`. All vite.config.ts alias targets shift by one directory level (`../plugins/...` → `../../plugins/...`).

### Boundary checker

- `boundary.config.ts`: remove `zone("web", { match: "web" })` and its edges. Becomes `plugin.web`.
- `exclude` list: update `web/src/...` → `plugins/web/web/...`.
- `plugin-registry-gen.ts`: update `RUNTIMES.web.registryFile` and `generatedFile`.

### Build system

- `cli/src/commands/build.ts`: `resolve(root, "web")` → `resolve(root, "plugins/web")`.
- Gateway: static files served from `web/dist` → `plugins/web/dist`. Verify the spec JSON `web` field.
- `tsc` invocation: update path.

### Key risks

- shadcn `components.json` likely has a `tsConfigFilePath` pointing to the old location. Must update.
- Vite `build.outDir` resolves to `plugins/web/dist` — gateway spec must match.

### Done when

- `./singularity build` succeeds, SPA loads in browser.
- `./singularity check` passes.
- `web/` deleted from repo root.

---

## Phase 7: `tooling/` → `plugins/tooling/`

**Before CLI** because CLI imports `@tooling/*`. Moving tooling first means CLI's alias just gets retargeted.

### What moves

```
plugins/tooling/
  src/               ← no zone structure (pure tool, no cross-plugin API)
    boundaries/
    checks/
    guards/
    lint/
    docgen.ts, guard.ts, plugin-registry-gen.ts
```

Tooling is a leaf package with no web/server runtime. Keeps `src/` layout.

### Import paths

`@tooling/*` → retarget from `tooling/src/*` to `plugins/tooling/src/*`. Consumers: CLI and root config files.

Root config file updates:
- `boundary.config.ts`: `import ... from "./tooling/src/boundaries/config"` → `"./plugins/tooling/src/boundaries/config"`
- `eslint.config.ts`: `import ... from "./tooling/src/lint/..."` → `"./plugins/tooling/src/lint/..."`
- `.claude/settings.json` hooks: `bun tooling/src/guard.ts` → `bun plugins/tooling/src/guard.ts`

### Boundary checker

- `boundary.config.ts`: remove `zone("tooling", { match: "tooling" })`. Becomes `plugin.tooling`.
- Self-validation: after this move, `plugin-boundaries` scans `plugins/tooling/` as a regular plugin. The `no-plugin-imports-in-core` check no longer needs to protect `tooling/` (it's now a plugin that can import other plugins).

### Key risks

- **Self-referential bootstrap.** `boundary.config.ts` imports from `plugins/tooling/...`. If this import fails, `./singularity check` can't run. The module has zero external deps so this is safe as long as the path is correct.
- `checks/index.ts` imports `boundary.config.ts` via relative path — depth changes from `../../../boundary.config` to `../../../../boundary.config`. Verify.

### Done when

- `./singularity check` passes (including boundary checker scanning itself as a plugin).
- `tooling/` deleted from repo root.

---

## Phase 6: `cli/` → `plugins/cli/`

**Last** because it depends on tooling's final location.

### What moves

```
plugins/cli/
  src/               ← no zone structure (pure binary, no cross-plugin API)
    index.ts         ← Commander entry
    commands/
    git/
    migrations.ts, broadcasts.ts, paths.ts
```

### Import paths

- `@tooling/*` already retargeted by Phase 7.
- `@plugins/*` paths in tsconfig shift: `"@plugins/*": ["../../plugins/*"]`.

### Entry point

The `singularity` shell script at repo root: `exec bun cli/src/index.ts "$@"` → `exec bun plugins/cli/src/index.ts "$@"`.

Self-referential calls in `push.ts` (CLI spawns itself as subprocess): `bun cli/src/index.ts check` → `bun plugins/cli/src/index.ts check`. Grep for all `cli/src/index.ts` references.

### Boundary checker

- `boundary.config.ts`: remove `zone("cli", { match: "cli" })`. Becomes `plugin.cli`.

### Key risks

- **Entry point is the critical path.** If `./singularity build` can't run, nothing can be verified. Update the shell script first, verify it works, then proceed with the rest.
- Self-invocation in `push.ts` must use the new path.

### Done when

- `./singularity build`, `./singularity check`, and `./singularity push` (dry-run) all work.
- `cli/` deleted from repo root.

---

## Phase Order

```
3 (plugin-core)  →  4 (server)  →  5 (web)  →  7 (tooling)  →  6 (cli)
```

- **3 first**: everything imports `@core`
- **4 second**: most valuable, unlocks the DAG pain point
- **5 third**: simple, no dependents
- **7 before 6**: CLI imports `@tooling/*`
- **6 last**: pure leaf consumer

Phases 3 and 5 are independent and could run in parallel if desired.

## End State

After all phases, the repo root simplifies to:

```
├── plugins/           ← everything is here
│   ├── plugin-core/
│   ├── server/
│   ├── web/
│   ├── cli/
│   ├── tooling/
│   ├── shell/
│   ├── tasks/
│   └── ...
├── gateway/           ← Go binary, stays at root
├── boundary.config.ts ← references plugins/tooling/
├── eslint.config.ts   ← references plugins/tooling/
├── singularity        ← shell script, references plugins/cli/
└── package.json       ← workspaces: ["plugins/**"]
```

`boundary.config.ts` zones simplify to one zone with `discover: "plugin-tree"`:

```typescript
zones: [
  zone("plugin", { match: "plugins", discover: "plugin-tree" }),
  zone("central", { match: "central" }),  // until Phase 4b
],
```

The zone DAG (`core/internal/server/web/cli`) is enforced within each plugin by the zone model from phases 1–2, not by top-level directory zones.

## Verification

After each phase:
1. `./singularity build` — full build succeeds
2. `./singularity check` — all checks pass (boundary-rules, plugin-boundaries, typescript, eslint, etc.)
3. Navigate to `http://<worktree>.localhost:9000` — app loads and functions
4. The moved directory is fully deleted from repo root
