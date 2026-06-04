import type { Command } from "commander";
import { checkBroadcasts } from "../broadcasts";
import { withHostSlot, type HostSlotKind } from "../host-semaphore";
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
      // Push runs its checks via this command in a subprocess (see push.ts);
      // it tags them so they take the reserved push slot instead of a build
      // slot. A direct `./singularity check` is a build-pool job.
      const kind: HostSlotKind = process.env.SINGULARITY_PUSH_CHECK ? "push" : "build";
      const ok = await withHostSlot(kind, () =>
        runChecks(checks.length > 0 ? checks : undefined),
      );
      if (!ok) process.exit(1);
    });
}
