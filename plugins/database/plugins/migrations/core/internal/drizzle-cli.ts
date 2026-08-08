/**
 * The ONE place the drizzle CLI's argv is built.
 *
 * `generate` is the only subcommand this repo supports: it is a pure filesystem
 * operation (snapshot diff → SQL) that opens no connection. Every OTHER
 * subcommand (`push`, `migrate`, `studio`, `pull`) DIALS the database in
 * `dbCredentials`, which `../../drizzle.config.ts` deliberately sets to a
 * non-resolving `.invalid` sentinel — so pointing one at this config fails by
 * design. Migrations are APPLIED by the runner (`server/internal/runner.ts`, on
 * boot) or `./singularity apply-migrations`, both of which build their own
 * connection.
 *
 * That invariant used to be a text scan over the repo — a check that paired each
 * occurrence of the binary's name with the nearest subcommand token within 8
 * lines, which cannot tell an argv element from a string literal and failed the
 * build on a `Set` of command names that invoked nothing
 * (`research/2026-08-08-global-drizzle-cli-argv-owner.md`). It is now a type
 * constraint instead: the binary name and `generate` are welded together in one
 * literal below, and callers pass typed FLAGS. There is no argument shape that
 * produces a different subcommand.
 *
 * The remaining hole — someone spelling the binary name into their own spawn —
 * is caught by the `drizzle-cli-safety/no-adhoc-drizzle-cli` lint rule, which
 * reads `DRIZZLE_KIT_BIN` from right here so the two can never drift.
 *
 * The child's cwd is NOT part of the argv but is just as load-bearing: it must
 * be `MIGRATIONS_PLUGIN_DIR` (see its docblock — drizzle-kit resolves every
 * relative path in the config against its CWD, and the wrong one globs nothing
 * and exits 0).
 */

/**
 * The CLI binary name. The ONLY place in the repo it is spelled — everything
 * else either goes through `drizzleGenerateArgv` or imports this constant.
 */
export const DRIZZLE_KIT_BIN = "drizzle-kit";

/** The only subcommand supported through `drizzle.config.ts`. */
const GENERATE = "generate";

export interface DrizzleGenerateOptions {
  /** `--custom` — emit an empty data/backfill migration instead of a schema diff. */
  custom?: boolean;
  /** `--name <slug>` — the migration's slug. */
  name?: string | null;
  /**
   * `--config=<path>` — an alternate config, relative to the child's cwd
   * (`MIGRATIONS_PLUGIN_DIR`). Used by `migrations-in-sync`, which generates into
   * a throwaway `out` dir.
   */
  configPath?: string | null;
}

/**
 * The full argv for a sanctioned `generate` run, ready to spawn with
 * `cwd: resolve(root, MIGRATIONS_PLUGIN_DIR)`.
 *
 * `bunx` (`<bun> x`) falls back to Node when the binary's shebang is
 * `#!/usr/bin/env node` — which drizzle-kit ships. Once Node owns the process,
 * transitive imports through plugin barrels can reach `paths/bins.ts`, which
 * calls `Bun.which()` and crashes the child with "Bun is not defined": a silent
 * exit 0 with no migration generated. `--bun` forces the Bun runtime regardless
 * of shebang, which is why it lives in the shared builder rather than in one
 * call site's copy of the argv.
 */
export function drizzleGenerateArgv(
  opts: DrizzleGenerateOptions = {},
): string[] {
  const argv = [process.execPath, "x", "--bun", DRIZZLE_KIT_BIN, GENERATE];
  if (opts.custom) argv.push("--custom");
  if (opts.name) argv.push("--name", opts.name);
  if (opts.configPath) argv.push(`--config=${opts.configPath}`);
  return argv;
}
