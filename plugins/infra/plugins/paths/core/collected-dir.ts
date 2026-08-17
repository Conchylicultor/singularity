import { defineCollectedDir } from "@plugins/framework/plugins/tooling/plugins/collected-dir/core";

// Marks `data-dirs` as a collected-dir runtime: codegen scans core files for this
// marker and emits `data-dirs.generated.ts` registering every plugin's
// `data-dirs/index.ts` (default-export `DataDir[]`), exactly as `check/` works.
// Auto-discovered — a plugin declaring its directories needs no codegen edit.
//
// The registry exists so the declarations can be ENUMERATED without importing
// every plugin: `paths:no-undeclared-data-dirs` loads this one generated entry
// list, and each plugin imports only its own `data-dirs/` folder — so collecting
// the declarations creates no cross-plugin import edge.
export const dataDirsCollectedDir = defineCollectedDir("data-dirs");
