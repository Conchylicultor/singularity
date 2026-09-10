import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { testDbSweepJob } from "./internal/sweep-job";
import { leakedTestDbKind } from "./internal/report-kind";

// WHY this is a child plugin rather than one more file on `db-test-fixture`
// itself — the same reason `worktree-db` is: the fixture must stay jobs-free,
// because `infra/jobs`' own test suite imports it, so a fixture that imported
// jobs would close that edge into an import cycle (R6). Parent and child are
// independent plugin ids with no umbrella exception, so `sweep → infra/jobs` and
// `infra/jobs (test) → db-test-fixture` coexist acyclically. The name grammar
// they share lives in `db-test-fixture/core`, which imports neither.

export { leakedTestDbKind } from "./internal/report-kind";

export default {
  description:
    "Reclaims throwaway test databases left behind when a test process is killed before its afterAll can drop them — the backstop half of createTestDb's lifetime, since a hook cannot run in a process that died. Every drop files a test-database-leaked report, so a destructive sweep is never silent.",
  contributions: [leakedTestDbKind],
  register: [testDbSweepJob],
} satisfies ServerPluginDefinition;
