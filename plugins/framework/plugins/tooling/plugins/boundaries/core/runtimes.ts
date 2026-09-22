import { RUNTIME_FOLDERS } from "@plugins/framework/plugins/plugin-id/core";

// The folder names a `@plugins/<p>/<folder>` specifier may end in: the barrel
// folders, from the single source of truth in `plugin-id/core`. Deliberately
// NOT the boundary table's keys, which also hold the leaf folders (`check/`,
// `lint/`, `bin/`, …) — nothing imports a leaf, so `@plugins/x/check` stays an
// illegal specifier.
export const runtimeNames: ReadonlySet<string> = new Set(RUNTIME_FOLDERS);
