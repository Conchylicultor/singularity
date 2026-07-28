import { defineConfig } from "drizzle-kit";

/**
 * CODEGEN config for `drizzle-kit generate` — and ONLY that subcommand.
 *
 * `generate` is a pure filesystem operation: it diffs the discovered schema
 * files against the snapshots in `./data` and writes SQL. It opens no
 * connection, so this file needs no database. It used to call
 * `readDatabaseConfig()` and throw without `SINGULARITY_WORKTREE`, which made a
 * filesystem codegen step LOOK database-entangled — the reason migration
 * generation appeared impossible on a host with no local cluster.
 *
 * drizzle-kit's `Config` type still demands credentials, so we hand it an
 * explicit non-connecting sentinel. `.invalid` is the reserved TLD (RFC 2606):
 * it is guaranteed never to resolve, so if a dialing subcommand is ever pointed
 * at this config the connection fails LOUDLY instead of silently reaching a real
 * database — the host's own, or worse, the wrong worktree's.
 *
 * Consequently the dialing subcommands (`push`, `migrate`, `studio`, `pull`) are
 * UNSUPPORTED through this config and must never be wired up: migrations are
 * applied by the runner in `server/internal/runner.ts` (on boot) or by
 * `./singularity apply-migrations`, both of which build their own connection.
 * The `database-migrations:drizzle-kit-generate-only` check
 * (`check/drizzle-kit-generate-only.ts`) enforces that invariant.
 */
export default defineConfig({
  dialect: "postgresql",
  // Glob discovery: drizzle-kit picks up every plugin's tables.ts / schema.ts
  // directly, not through plugin index.ts files (which would pull in handlers,
  // routes, and other server init code that shouldn't run during codegen).
  //
  // NOTE: this array is also parsed as TEXT by `core/internal/schema-glob.ts`
  // (the single source of truth for "which files drizzle-kit discovers"), so it
  // must stay a plain array of string literals.
  schema: [
    "../../../../plugins/**/server/**/internal/tables.ts",
    "../../../../plugins/**/server/**/internal/tables-*.ts",
    "../../../../plugins/**/server/**/internal/schema.ts",
    "../../../../plugins/**/server/**/internal/schema-*.ts",
  ],
  out: "./data",
  dbCredentials: { url: "postgres://codegen@codegen.invalid/codegen" },
});
