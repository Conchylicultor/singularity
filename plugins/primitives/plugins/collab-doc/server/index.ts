import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

// The `bytea` drizzle column type for persisted doc state. Exported from the
// SERVER barrel — deliberately NOT from `core` — because consumers are plugin
// `tables.ts` schema files, which drizzle-kit loads via a synchronous CJS
// require: the core barrel pulls the headless Lexical bridge
// (`lexical` / `@lexical/yjs`), whose module graph is async-only, and a
// schema file importing it fails drizzle-kit's loader (which then silently
// reports "no schema change"). Keeping the column type on a lean drizzle-only
// barrel makes that failure mode unrepresentable.
export { bytea } from "../core/internal/bytea";

export default {
  description:
    "Server presence of collab-doc: the bytea drizzle column type for persisted Yjs doc state, on a lean barrel that schema files (drizzle-kit's sync loader) can import without the Lexical bridge.",
} satisfies ServerPluginDefinition;
