export { schemaGlobFiles } from "./internal/schema-glob";
// The repo-relative DEV-TREE location of this plugin — drizzle-kit's cwd for
// every sanctioned invocation, and the anchor its relative config paths resolve
// against. Public because the two invocation sites live in other plugins
// (checks/migrations-in-sync, cli/bin/migrations.ts); a hand-written copy that
// drifts points migration generation at a directory where the schema globs match
// nothing, which drizzle-kit reports as success. NOT the runtime migrations dir
// (see the declaration's docblock). `SCHEMA_GLOBS` stays internal — no consumer.
export { MIGRATIONS_PLUGIN_DIR } from "./internal/schema-glob-patterns";
// The argv for a sanctioned `generate` run. Public for the same reason
// MIGRATIONS_PLUGIN_DIR is: both invocation sites live in other plugins
// (checks/migrations-in-sync, cli/bin/migrations.ts). It takes typed FLAGS, so
// no caller can produce a subcommand other than `generate` — the dialing ones
// are unsupported through drizzle.config.ts's sentinel credentials.
// `DRIZZLE_KIT_BIN` stays internal: its only other reader is this plugin's own
// lint rule, which imports it relatively.
export { drizzleGenerateArgv } from "./internal/drizzle-cli";
export type { DrizzleGenerateOptions } from "./internal/drizzle-cli";
export { classifyMigrationSql } from "./internal/destructive";
export type {
  DestructiveClassification,
  DestructiveKind,
} from "./internal/destructive";
