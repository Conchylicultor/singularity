import type { Command } from "commander";
import {
  generateBarrelStubs,
  generatePluginRegistry,
  generatePluginDocs,
  generateConfigOrigins,
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
      "Regenerate all non-migration codegen artifacts: barrel stubs, plugin registries, " +
        "plugin docs (compact/details/routes/CLAUDE.md autogen blocks), and config origins. " +
        "Used by the post-rebase normalize step in `push`. Idempotent.",
    )
    .action(async () => {
      const root = await getWorktreeRoot();
      await generateBarrelStubs({ root });
      await generatePluginRegistry({ root });
      await generatePluginDocs({ root });
      await generateConfigOrigins({ root });
    });
}
