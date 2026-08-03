import type { Command } from "commander";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";
import { normalizeGeneratedArtifacts } from "../git/normalize-generated";

export function registerNormalizeGenerated(program: Command) {
  program
    .command("normalize-generated")
    .description(
      "Repair generated artifacts a merge driver auto-resolved during a merge or " +
        "rebase: re-derive them from the merged sources and amend the head commit. " +
        "Marker-gated, so it is a no-op after a merge that touched no generated " +
        "file. Invoked automatically by the `post-rewrite` git hook after any " +
        "rebase/amend, and by `push` around its own rebase — run it by hand only " +
        "when a check reports an un-normalized auto-resolve. Idempotent.",
    )
    .action(async () => {
      await normalizeGeneratedArtifacts(await getWorktreeRoot());
    });
}
