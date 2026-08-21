import { defineCliCommand } from "@plugins/framework/plugins/cli/core";

/**
 * `db` is a GROUP: it routes and never runs. The declaration union makes that
 * exclusive — a group has `subcommands` and cannot also carry `run` — so
 * `./singularity db` printing its own help rather than doing something is a
 * property of the shape, not of a runtime check.
 *
 * One subcommand today. It stays a group because the verb it reserves is
 * "worktree database operations", and the next one (drop, list, backup — the
 * operations `database/plugins/admin/server` already exports) is a file beside
 * `fork.ts` plus a line here.
 */
export default defineCliCommand({
  name: "db",
  description: "Worktree database operations",
  subcommands: [
    defineCliCommand<[string | undefined], object>({
      name: "fork",
      description:
        "Fork the main 'singularity' DB into [target]. For worktrees created " +
        "outside Singularity (git worktree add), which get no fork on creation. " +
        "Idempotent: a no-op if the DB already exists. Requires a running " +
        "backend (this worktree's, else main's) to read which tables must not " +
        "be copied.",
      arguments: [
        {
          name: "[target]",
          description: "database to create (defaults to the current worktree)",
        },
      ],
      run: () => import("./fork"),
    }),
  ],
});
