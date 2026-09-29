export { schemaGlobFiles } from "./internal/schema-glob";
// The repo-relative DEV-TREE location of this plugin — drizzle-kit's cwd for
// every sanctioned invocation, and the anchor its relative config paths resolve
// against. Public because the two invocation sites live in other plugins
// (checks/migrations-in-sync, cli/plugins/migrations/cli/migrations.ts); a hand-written copy that
// drifts points migration generation at a directory where the schema globs match
// nothing, which drizzle-kit reports as success. NOT the runtime migrations dir
// (see the declaration's docblock). `SCHEMA_GLOBS` stays internal — no consumer.
export { MIGRATIONS_PLUGIN_DIR } from "./internal/schema-glob-patterns";
// The argv for a sanctioned `generate` run. Public for the same reason
// MIGRATIONS_PLUGIN_DIR is: both invocation sites live in other plugins
// (checks/migrations-in-sync, cli/plugins/migrations/cli/migrations.ts). It takes typed FLAGS, so
// no caller can produce a subcommand other than `generate` — the dialing ones
// are unsupported through drizzle.config.ts's sentinel credentials.
// `DRIZZLE_KIT_BIN` stays internal: its only other reader is this plugin's own
// lint rule, which imports it relatively. `DRIZZLE_CONFIG_PATH` is public for
// migrations-in-sync, whose throwaway config extends the real one.
export {
  drizzleGenerateArgv,
  DRIZZLE_CONFIG_PATH,
} from "./internal/drizzle-cli";
export type { DrizzleGenerateOptions } from "./internal/drizzle-cli";
// The phased-migration file grammar, shared by the generator (cli) and the
// runner (server). See research/2026-09-29-global-phased-migrations.md.
export {
  migrationClaimId,
  parseMigration,
  renderPhasedMigration,
} from "./internal/phases";
export type { ParsedMigration, PhasedMigration } from "./internal/phases";
// The one statement splitter for migration SQL (comment/literal/dollar-quote
// aware), shared by the phaser and the data-migration-dml-only and
// fork-schema-drift checks.
export { splitStatements } from "./internal/statements";
export type { Statement } from "./internal/statements";
// The closed expand / contract / reject statement table the generator phases a
// schema migration with, and the migration-phases-valid check re-runs.
export {
  classifyStatement,
  phaseStatements,
  renderStatements,
} from "./internal/classify";
export type {
  ContractOp,
  ExpandOp,
  PhasedStatements,
  RejectOp,
  StatementClass,
  StatementOp,
} from "./internal/classify";
