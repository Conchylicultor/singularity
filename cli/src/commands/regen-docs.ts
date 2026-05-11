import type { Command } from "commander";
import { generatePluginDocs } from "@tooling/docgen";

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

export function registerRegenDocs(program: Command) {
  program
    .command("regen-docs")
    .description(
      "Regenerate plugins-compact.md, plugins-details.md, and per-plugin CLAUDE.md autogen blocks. " +
        "Used by the post-rebase normalize step in `push`. Idempotent.",
    )
    .action(async () => {
      const root = await getWorktreeRoot();
      await generatePluginDocs({ root });
    });
}
