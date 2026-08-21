import { defineCliCommand } from "@plugins/framework/plugins/cli/core";

/**
 * The fresh-clone seam. A checkout that has never built has no 'singularity'
 * DB, and the server is what normally applies migrations — so mise's `setup`
 * runs this once to seed the base DB before the first build. Nothing else
 * should: the server applies migrations itself on boot.
 *
 * Everything it needs — `pg`, `drizzle-orm`, the database barrels — sits behind
 * the declaration's lazy `import("./run")`, so the other commands no longer pay
 * for a Postgres driver they never touch.
 */
export default defineCliCommand({
  name: "apply-migrations",
  description:
    "Apply pending SQL migrations to the DB selected by SINGULARITY_WORKTREE. " +
    "Used by the fresh-clone bootstrap (mise `setup`) to seed the base " +
    "'singularity' DB before the first build; the server otherwise applies " +
    "migrations itself on boot.",
  run: () => import("./run"),
});
