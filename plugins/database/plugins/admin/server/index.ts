import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export {
  getAdminPool,
  closeAdminPool,
  openShortLivedClient,
  connectionString,
} from "./internal/pool";
export {
  listDatabases,
  databaseExists,
  dropDatabase,
  ensureDatabase,
  countActiveConnections,
} from "./internal/databases";
export { forkDatabase } from "./internal/fork";
export type { ForkOutcome } from "./internal/fork";
// What the fork found while matching the declared set against the source
// catalog: `ForkPlanError` is the deterministic refusal (see ./internal/fork-plan
// for the two states that earn it), and the rest is what a caller with a human
// or a bell should surface.
export { describeUndeclaredSchema, ForkPlanError } from "./internal/fork-plan";
export type { ForkPlan, UndeclaredSchema } from "./internal/fork-plan";
// A plugin declares "don't fork my data" for its own table / schema (see
// ./internal/fork-exclusion for the trade this makes); `forkExclusions` is the
// collected set every `forkDatabase` caller must pass.
export {
  ExcludeFromFork,
  ExcludeSchemaDataFromFork,
  forkExclusions,
} from "./internal/fork-exclusion";
export type {
  ForkExclusions,
  ForkSchemaExclusion,
} from "./internal/fork-exclusion";
export { forkTempPrefix } from "./internal/temp-name";
export { backupDatabase, inspectBackup } from "./internal/backup";
export type { BackupInfo, TableStat } from "./internal/backup";

export default {
  description:
    "Admin operations for the database plugin — fork, backup, drop, list.",
} satisfies ServerPluginDefinition;
