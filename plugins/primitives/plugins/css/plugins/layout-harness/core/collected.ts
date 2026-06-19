import { defineCollectedDir } from "@plugins/framework/plugins/tooling/plugins/collected-dir/core";

// Marks `fixtures` as a collected-dir runtime: codegen scans core files for this
// marker and emits `fixtures.generated.ts` registering every plugin's
// `fixtures/index.ts` (default-export LayoutFixture[]). Auto-discovered — no
// codegen edits needed when a new primitive contributes fixtures.
export const fixturesCollectedDir = defineCollectedDir("fixtures");
