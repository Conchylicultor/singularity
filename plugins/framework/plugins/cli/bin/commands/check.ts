import type { Command } from "commander";
import { checkBroadcasts } from "../broadcasts";
import { listAllChecks, runChecks } from "@plugins/framework/plugins/tooling/plugins/checks/core";

export function registerCheck(program: Command) {
  program
    .command("check")
    .description("Run repo validation checks")
    .argument("[checks...]", "Check IDs to run (default: all)")
    .option("--list", "List available checks and exit")
    .action(async (checks: string[], opts: { list?: boolean }) => {
      if (opts.list) {
        const all = await listAllChecks();
        for (const c of all) console.log(`  ${c.id} — ${c.description}`);
        return;
      }
      await checkBroadcasts("check");
      const ok = await runChecks(checks.length > 0 ? checks : undefined);
      if (!ok) process.exit(1);
    });
}
