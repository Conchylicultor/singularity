import { defineCliCommand } from "@plugins/framework/plugins/cli/core";

/**
 * `build`'s migration-generation stage, standalone, for the one situation that
 * needs it alone: a rebase has moved the schema under branch-local migrations
 * that were generated against the old one, so they must be discarded and
 * regenerated rather than replayed.
 *
 * The generics are pinned so `--name` and the action's `opts.name` cannot drift
 * apart — renaming the flag here becomes a type error in `run.ts` rather than an
 * `undefined` that silently falls through to the derived default.
 */
export default defineCliCommand<[], { name?: string }>({
  name: "regen-migrations",
  description:
    "Reset branch-local migrations and re-run drizzle-kit generate against the rebased schema. " +
    "Used by the post-rebase normalize step in `push`. Aborts if any branch-local SQL was hand-edited.",
  options: [
    {
      flags: "--name <slug>",
      description:
        "Slug for the regenerated migration (default: merged_YYYYMMDD_HHMM)",
    },
  ],
  run: () => import("./run"),
});
