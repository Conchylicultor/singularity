# Boundary Rules API — Generic, Default-Deny Import Restrictions

## Context

Import boundaries were enforced by 4 separate checks totaling ~1,100 lines of hardcoded TypeScript. The rules were non-composable, allow-by-default, and impossible for plugins to extend. New zones got no protection until someone wrote a new check.

## Design: Two Orthogonal Layers

Both layers are default-deny. Both must pass for an import to be allowed.

### Layer 1 — Runtime Isolation

Each runtime declares which runtimes it can import from. Unlisted = blocked.

```ts
runtimes: {
  web:     ["web", "shared"],
  server:  ["server", "shared"],
  central: ["central", "shared"],
  shared:  ["shared"],
},
```

Surgical exceptions for specific cross-runtime pairs:

```ts
runtimeExceptions: [
  "plugin.infra.secrets.central -> plugin.infra.paths.server",
],
```

Non-runtime zones (core, server, web, central, cli) skip the runtime check.

### Layer 2 — Zone DAG

Zone-level edges (no runtime suffixes). First-match ordering, default-deny.

```ts
edges: [
  allow("** -> plugin.plugin-tree"),      // utility code, globally accessible
  allow("** -> plugin.retry"),
  allow("server  -> core"),
  allow("plugin.** -> core"),
  allow("plugin.** -> server"),
  allow("plugin.** -> plugin.**"),
  // deny("plugin.infra.** -> plugin.apps.**"),  // example deny
],
```

### Evaluation

For every cross-module import:

1. **Self-import** (same zone) → always allowed.
2. **Runtime check**: does `runtimes[sourceRuntime]` include `targetRuntime`? No → violation (unless exempted).
3. **Zone check**: strip runtime suffixes, evaluate edges top-to-bottom (first match wins). No match → default-deny.
4. **Cycle detection**: DFS on the realized edge graph (using full zone.runtime keys).

### Wildcards

| Pattern | Matches |
|---------|---------|
| `*` | Exactly one segment |
| `**` | Zero or more segments |

Examples: `plugin.**`, `**.shared`, `plugin.infra.**`, `plugin.*.web`.

## File Layout

```
boundary.config.ts                    # Central config
cli/src/boundaries/
  types.ts                            # BoundaryConfig, ZoneDefinition, Edge
  config.ts                           # defineBoundaries, zone, allow, deny
  match.ts                            # Wildcard matching (*, **)
  resolve.ts                          # File path / import specifier → { zone, runtime }
  evaluate.ts                         # Edge evaluation + runtime check + cycle detection
  check.ts                            # Check implementation
```

## Future: Level 2 — Symbol Visibility

Per-module `boundary.ts` files declaring which barrel exports are public/restricted/private per consumer zone. Would subsume R5 (default-import registry-only).
