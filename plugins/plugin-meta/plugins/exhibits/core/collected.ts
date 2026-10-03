import { defineCollectedDir } from "@plugins/framework/plugins/tooling/plugins/collected-dir/core";

// Marks `exhibits` as a collected-dir runtime: codegen scans core files for
// this marker and emits `exhibits.generated.ts` registering every plugin's
// `exhibits/index.ts` (default export: one Exhibit or an array of them).
// Auto-discovered — a new contributor needs no codegen or registry edit.
export const exhibitsCollectedDir = defineCollectedDir("exhibits");
