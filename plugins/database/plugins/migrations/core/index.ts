export { schemaGlobFiles } from "./internal/schema-glob";
// The repo-relative DEV-TREE location of this plugin — drizzle-kit's cwd for
// every sanctioned invocation, and the anchor its relative config paths resolve
// against. Public because the two invocation sites live in other plugins
// (checks/migrations-in-sync, cli/bin/migrations.ts); a hand-written copy that
// drifts points migration generation at a directory where the schema globs match
// nothing, which drizzle-kit reports as success. NOT the runtime migrations dir
// (see the declaration's docblock). `SCHEMA_GLOBS` stays internal — no consumer.
export { MIGRATIONS_PLUGIN_DIR } from "./internal/schema-glob-patterns";
export { classifyMigrationSql } from "./internal/destructive";
export type {
  DestructiveClassification,
  DestructiveKind,
} from "./internal/destructive";
