# Auto-detect tsc entry points

## Context

The `typescript` check and the `build` command both hardcode which framework plugins get type-checked. Adding a new framework sub-plugin (e.g. a future `worker-core`) requires editing both files. The `cli` sub-plugin is silently skipped by the check today.

Goal: scan `plugins/framework/plugins/*/` at runtime for directories with `tsconfig.json`, so new framework plugins are automatically type-checked.

## Plan

### 1. New file: `plugins/framework/plugins/tooling/plugins/checks/core/discover.ts`

Discovery function that scans `plugins/framework/plugins/*/`:

```typescript
interface TscTarget {
  name: string;        // directory basename (e.g. "server-core")
  dir: string;         // absolute path
  args: string[];      // e.g. ["-p", "tsconfig.app.json"] or []
  hasEntrypoint: boolean;  // has bin/index.ts (server-like runtime)
}

function discoverTscTargets(root: string): TscTarget[]
```

Heuristic:
- If `tsconfig.app.json` exists → `args: ["-p", "tsconfig.app.json"]` (web-core case)
- Else if `tsconfig.json` exists → `args: []`
- `hasEntrypoint` = `existsSync(join(dir, "bin", "index.ts"))`
- Sort by name for stable output

### 2. Rewrite typescript check to use discovery loop instead of hardcoded list

### 3. Update build.ts to use `discoverTscTargets(root).filter(t => t.hasEntrypoint)` in the parallel block

## Behavioral changes

| | Before | After |
|---|---|---|
| `cli` plugin | Not type-checked anywhere | Checked in typescript check + build tsc |
| New framework plugin with tsconfig | Silently ignored | Auto-included |
| Profiler span IDs | `tscServer`, `tscCentral` | `tsc:server-core`, `tsc:central-core`, `tsc:cli` |
