import { defineCollectedDir } from "@plugins/framework/plugins/tooling/plugins/collected-dir/core";

// Marks `deps` as a collected-dir runtime: codegen scans core files for this
// marker and emits `deps.generated.ts` registering every plugin's
// `deps/index.ts` whose default export is an array of `defineDep` values.
// Auto-discovered — a plugin declaring a dependency needs no codegen edit.
//
// The engine's `declaredDeps()` (`deps/internal/registry.ts`) loads this one
// entry list, so the declared set is known without booting a backend. Not
// re-exported from the `core` barrel: `core` is web-importable, and the
// registry's loaders reach host-only `deps/` barrels.
export const depsCollectedDir = defineCollectedDir("deps");
