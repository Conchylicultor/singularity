# Config

Per-worktree settings with two contribution shapes. Pick the one that matches the data.

## Scalars — `Config.Spec` (default)

For `string`, `number`, `boolean`, and `string-list` preferences. The plugin just declares fields with `defineConfig` and contributes `Config.Spec(descriptor)`. Storage (the `config` table), validation, the Settings UI row, and push sync are all handled for you.

```ts
// plugins/<name>/shared/config.ts
import { defineConfig } from "@plugins/config/shared";

export const myConfig = defineConfig({
  timeoutMs: {
    default: 3000,
    description: "How long to wait before giving up.",
  },
});

// plugins/<name>/web/index.ts
contributions: [Config.Spec(myConfig)];
// plugins/<name>/server/index.ts
config: myConfig;
```

Read server-side with `readConfig(myConfig)`; client-side with `useConfigValues(myConfig, "<plugin-id>")`.

## Structured settings — `Config.Section` (escape hatch)

For anything the scalar kinds can't express: lists of items with sub-state, per-item toggles, collections with typed fields, etc. The config plugin does **not** try to be a document store — that path lies through a weaker DB, not a better primitive. Instead, `Config.Section` mounts the plugin's own React component inside its Settings group, and the plugin owns storage.

```ts
Config.Section({
  id: "excluded-path-state",
  title: "Excluded path toggles",
  component: ExcludedPathToggles,
});
```

### Storage convention

Structured state lives in a **plugin-owned table**, named `<plugin_id_with_underscores>_<collection>`:

- Plugin `stats-commits`, collection `excluded_path_state` → table `stats_commits_excluded_path_state`.
- Schema at `plugins/<path>/server/schema.ts`, registered via `export * from …` in `server/src/db/schema.ts`.
- If the UI needs realtime sync, define a push resource with key `<plugin-id>.<collection>` and `notify()` from mutation handlers.
- Routes under `/api/<feature>/<collection>` — no central config endpoint.

### Why a convention, not a helper

We have one use case today. A `defineCollection` helper that wires table + routes + resource + UI against a sample size of one will encode the wrong abstraction. The convention makes the eventual extraction trivial: when a second and third plugin need the same "list with per-item state" shape, lift the common pieces out then.

### Boundary check

If you're tempted to store `{ [item]: { enabled: boolean, … } }` as a JSON blob in a scalar config field, stop. That's the document-store smell — write a table. If it's genuinely a scalar map with no sub-fields beyond a single boolean or count, `string-list` with membership semantics is usually enough.
