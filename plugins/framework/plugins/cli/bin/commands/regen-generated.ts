import type { Command } from "commander";
import {
  regenerateRegistryCodegen,
  regenerateManifestCodegen,
  listReviewMarkedOverrides,
} from "@plugins/framework/plugins/tooling/plugins/codegen/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

export function registerRegenGenerated(program: Command) {
  program
    .command("regen-generated")
    .description(
      "Regenerate all non-migration repo-tree codegen artifacts: barrel stubs, " +
        "plugin registries, plugin docs (compact/details/CLAUDE.md autogen blocks), " +
        "the reorderable-slots / data-views / token-group-vars manifests, and config " +
        "origins. This is the SAME ordered repo-tree pipeline `./singularity build` " +
        "runs (shared via codegen core), so a full build immediately after is a no-op. " +
        "Used by the post-rebase normalize step in `push`. Idempotent.",
    )
    .action(async () => {
      const root = await getWorktreeRoot();
      await regenerateRegistryCodegen({ root });
      await regenerateManifestCodegen({ root });

      // This command runs inside push's merge-driver path, which is followed by
      // `git add -A && git commit --amend`. A config override still carrying an
      // `@review` marker is a machine-seeded / re-stamped default nobody has
      // reviewed — amending it would land exactly what the marker exists to
      // prevent. So the marker is asserted absent HERE rather than trusted to a
      // check ordering. (Markers are minted by `./singularity build` only; this
      // pipeline never creates one — see codegen's regen-pipeline.ts.)
      const marked = listReviewMarkedOverrides({ root });
      if (marked.length > 0) {
        console.error(
          `An @review marker reached a post-commit tree:\n  ${marked
            .map((rel) => `config/${rel}`)
            .join("\n  ")}\n` +
            "These overrides were machine-seeded and are not yet reviewed. Run " +
            "`./singularity build` locally, review each file (arrange the values, " +
            "then delete its `// @review` line), and commit it.",
        );
        process.exit(1);
      }
    });
}
