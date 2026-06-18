import type { Command } from "commander";
import {
  regenerateRegistryCodegen,
  regenerateManifestCodegen,
} from "@plugins/framework/plugins/tooling/plugins/codegen/core";

async function getWorktreeRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = await new Response(proc.stdout).text();
  if ((await proc.exited) !== 0) {
    console.error("Not in a git repository");
    process.exit(1);
  }
  return out.trim();
}

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
    });
}
