import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

// WHY this is a child plugin rather than one more function on `db-test-fixture`
// itself: the fixture must stay jobs-free, because `infra/jobs`' own test suite
// imports it. A fixture that imported jobs would close that edge into an import
// cycle (R6). Parent and child are independent plugin ids with no umbrella
// exception, so `worktree-db → infra/jobs` and `infra/jobs (test) →
// db-test-fixture` coexist acyclically — the split is what keeps the graph a
// DAG, not a filing preference.

export { worktreeDbScenario } from "./internal/scenario";
export type { DbExecutor } from "./internal/scenario";

export default {
  description:
    "Rolled-back-transaction harness for suites that must drive the REAL worktree DB (derived views included) rather than a throwaway: one scenario per transaction, always rolled back, with the excluded-from-fork queue schema installed once per process first.",
} satisfies ServerPluginDefinition;
