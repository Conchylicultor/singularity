import type { Command } from "commander";
import { basename } from "node:path";
import { forkDatabase } from "@plugins/database/plugins/admin/server";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

export function registerDb(program: Command) {
  const db = program.command("db").description("Worktree database operations");
  db.command("fork")
    .argument("[target]", "database to create (defaults to the current worktree)")
    .description(
      "Fork the main 'singularity' DB into [target]. For worktrees created " +
        "outside Singularity (git worktree add), which get no fork on creation. " +
        "Idempotent: a no-op if the DB already exists.",
    )
    .action(async (target?: string) => {
      const name = target ?? basename(await getWorktreeRoot());
      console.log(`Forking "singularity" → "${name}"...`);
      await forkDatabase("singularity", name);
      console.log(`DB "${name}" ready.`);
    });
}
